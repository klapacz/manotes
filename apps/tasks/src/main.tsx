import { RegistryContext } from "@effect/atom-solid";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { createCliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { Deferred, Effect, References, Runtime } from "effect";
import { Command } from "effect/unstable/cli";
import { AtomRegistry } from "effect/unstable/reactivity";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import * as CliPaths from "../../web/src/cli/cli.paths";
import * as Backend from "./backend";
import { TasksAtoms } from "./atoms";
import { TaskApp } from "./app";
import { Theme } from "./theme";

const run = Effect.fn("TasksMain.run")(function* () {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return yield* Effect.fail(
      new Error("The task TUI needs a terminal. Use tasks list for text output."),
    );
  }

  const atoms = yield* TasksAtoms.make;

  const registry = yield* Effect.acquireRelease(
    Effect.sync(() => AtomRegistry.make()),
    (registry) => Effect.sync(() => registry.dispose()),
  );

  const closed = yield* Deferred.make<void>();

  const renderer = yield* Effect.acquireRelease(
    Effect.tryPromise(() =>
      createCliRenderer({
        exitOnCtrlC: true,
        // NodeRuntime owns process signals and closes the entire Effect scope.
        exitSignals: [],
        onDestroy: () => Effect.runSync(Deferred.succeed(closed, undefined)),
      }),
    ),
    (renderer) => Effect.sync(() => renderer.destroy()),
  );

  yield* Effect.tryPromise(() =>
    render(
      () => (
        <RegistryContext.Provider value={registry}>
          <TasksAtoms.Provider value={atoms.runtime}>
            <Theme.Provider>
              <TaskApp />
            </Theme.Provider>
          </TasksAtoms.Provider>
        </RegistryContext.Provider>
      ),
      renderer,
    ),
  );

  yield* Effect.raceFirst(Deferred.await(closed), atoms.start);
});

const command = Command.make("tasks", {}, () =>
  run().pipe(
    Effect.provide(Backend.layer),
    Effect.provideService(References.MinimumLogLevel, "None"),
  ),
).pipe(
  Command.withDescription("Browse tasks from the local database with continuous cloud sync."),
  Command.withGlobalFlags([CliPaths.DirFlag]),
);

NodeRuntime.runMain(
  Command.run(command, { version: "0.0.0" }).pipe(
    Effect.scoped,
    Effect.provide(NodeServices.layer),
    Effect.provide(Reactivity.layer),
  ),
  {
    // NodeRuntime normally waits for an empty event loop on success. Bun's
    // --watch keeps it alive after q, so exit explicitly after scoped cleanup.
    teardown: (exit) => Runtime.defaultTeardown(exit, (code) => process.exit(code)),
  },
);
