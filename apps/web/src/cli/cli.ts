import path from "node:path";
import { Console, Effect, Option, flow } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliConfig } from "./cli.config";
import { CliGraphKey } from "./cli.graph-key";
import { CliPaths } from "./cli.paths";
import { CliSync } from "./cli.sync";
import { MaterializedFiles } from "./materialized-files";
import * as Materializer from "../lib/materializer.service";
import { CliRuntime } from "./cli.runtime";
import { ExecuteApi } from "./execute-api";
import * as EventRepo from "../lib/event.repo";

const init = Command.make(
  "init",
  {
    origin: Flag.string("origin"),
    token: Flag.string("token"),
    graphId: Flag.string("graph-id"),
    secret: Flag.string("secret"),
  },
  Effect.fn("Cli.init")(function* (input) {
    const origin = CliConfig.normalizeOrigin(input.origin);
    const graphKey = yield* CliGraphKey.fetchUnwrapped({ ...input, origin });
    const layerConfig = CliConfig.makeLayer({
      origin,
      token: input.token,
      graphId: input.graphId,
      graphKey,
    });

    // Create db dir before initializing database via Runtime.layer
    yield* CliPaths.mkdir().pipe(Effect.provide(layerConfig));

    yield* Effect.gen(function* () {
      yield* CliConfig.write();
      yield* syncAndWrite();
    }).pipe(
      Effect.provide(CliSync.layer),
      Effect.provide(CliRuntime.layer),
      Effect.provide(layerConfig),
    );
  }, Effect.provide(CliPaths.layer)),
).pipe(
  Command.withDescription("Create .manotes/ in the current directory and materialize the graph."),
);

const sync = Command.make(
  "sync",
  {},
  Effect.fn("Cli.sync")(
    function* () {
      yield* syncAndWrite();
    },
    flow(
      Effect.provide(CliSync.layer),
      Effect.provide(CliRuntime.layer),
      Effect.provide(CliConfig.layerFromFile),
      Effect.provide(CliPaths.layer),
    ),
  ),
).pipe(Command.withDescription("Publish local changes and download remote changes."));

const execute = Command.make(
  "execute",
  {
    script: Argument.file("script", { mustExist: true }).pipe(
      Argument.optional,
      Argument.withDescription("TypeScript/JavaScript script to run. Reads stdin when omitted."),
    ),
  },
  Effect.fn("Cli.execute")(
    function* ({ script }) {
      const scriptPath = yield* Option.match(script, {
        onNone: () => ExecuteApi.acquireStdinScript(),
        onSome: (file) => Effect.succeed(path.resolve(process.cwd(), file)),
      });

      yield* Effect.gen(function* () {
        yield* ExecuteApi.runScript(scriptPath);
        const materializer = yield* Materializer.Service;
        yield* materializer.catchUp();
        yield* MaterializedFiles.writeAll();
      }).pipe(
        Effect.tapCause(() =>
          Effect.gen(function* () {
            yield* Console.error(
              "Execution failed. Earlier editNote calls may already be saved locally.",
            );
            yield* printPending();
          }),
        ),
      );

      yield* Console.log("Local changes saved.");
      const pending = yield* printPending();
      if (pending > 0) yield* Console.log("Run `manotes sync` to publish.");
    },
    flow(
      Effect.provide(CliRuntime.layer),
      Effect.provide(CliConfig.layerFromFile),
      Effect.provide(CliPaths.layer),
    ),
  ),
).pipe(
  Command.withDescription("Run a trusted local script and save changes without syncing."),
  Command.withExamples([
    {
      command: "cat edit.ts | manotes execute",
      description: "Read a script from stdin; its default export receives the Manotes API.",
    },
  ]),
);

const status = Command.make("status", {}, () =>
  printPending().pipe(
    Effect.andThen(Effect.void),
    Effect.provide(CliRuntime.layer),
    Effect.provide(CliConfig.layerFromFile),
    Effect.provide(CliPaths.layer),
  ),
).pipe(Command.withDescription("Show the number of local changes awaiting publication."));

const syncAndWrite = Effect.fn("Cli.syncAndWrite")(function* () {
  yield* Effect.gen(function* () {
    yield* CliSync.run();
    const materializer = yield* Materializer.Service;
    yield* materializer.catchUp();
    yield* MaterializedFiles.writeAll();
  }).pipe(
    Effect.tapCause(() =>
      Effect.gen(function* () {
        // The original error still reaches runMain, which exits with failure.
        yield* Console.error("Sync failed.");
        yield* printPending();
        yield* Console.error("Retry with `manotes sync`.");
      }),
    ),
  );

  yield* Console.log("Sync complete.");
  yield* printPending();
});

function printPending() {
  return Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const count = yield* eventRepo.countPending();
    yield* Console.log(`Pending publication: ${count} changes`);
    return count;
  });
}

const cli = Command.make("manotes").pipe(
  Command.withDescription("Materialize a cloud graph onto the local filesystem."),
  Command.withSubcommands([sync, init, execute, status]),
  Command.withGlobalFlags([CliPaths.DirFlag]),
);

const runnable = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  Effect.provide(Reactivity.layer),
);

NodeRuntime.runMain(runnable);
