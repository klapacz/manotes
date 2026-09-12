import path from "node:path";
import { Console, Effect, Option, Redacted, Result, Schema, flow } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { Argument, CliError, Command, Flag } from "effect/unstable/cli";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliConfig } from "./cli.config";
import { CliPaths } from "./cli.paths";
import { CliUrl } from "./url";
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
    autoSync: Flag.boolean("auto-sync").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Enable auto sync after successful edits. Can be changed later in .manotes/config.",
      ),
    ),
    graphKey: Flag.redacted("graph-key").pipe(
      Flag.mapEffect(
        flow(
          Redacted.value,
          Schema.decodeEffect(CliConfig.GraphKey),
          Effect.mapError(
            () =>
              new CliError.InvalidValue({
                kind: "flag",
                option: "graph-key",
                value: "<redacted>",
                expected: "a base64-encoded 32-byte graph key",
              }),
          ),
        ),
      ),
      Flag.withDescription("Base64-encoded, unwrapped 32-byte graph key from the app."),
    ),
  },
  Effect.fn("Cli.init")(function* (input) {
    yield* CliPaths.ensureEmpty();
    const origin = CliConfig.normalizeOrigin(input.origin);

    const layerConfig = CliConfig.makeLayer({
      origin,
      token: input.token,
      graphId: input.graphId,
      graphKey: input.graphKey,
      autoSync: input.autoSync,
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
).pipe(Command.withDescription("Initialize an empty directory and materialize the graph."));

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

      if (pending === 0) return;

      const config = yield* CliConfig.Service;

      if (!config.autoSync) {
        yield* Console.log("Run `manotes sync` to publish.");

        return;
      }

      const result = yield* CliSync.run().pipe(Effect.provide(CliSync.layer), Effect.result);

      if (Result.isFailure(result)) {
        yield* Console.error("Automatic sync failed. Local changes remain saved.");
        yield* printPending();
        yield* Console.error("Retry with `manotes sync`.");

        return;
      }

      yield* writeSyncedChanges();
    },
    flow(
      Effect.provide(CliRuntime.layer),
      Effect.provide(CliConfig.layerFromFile),
      Effect.provide(CliPaths.layer),
    ),
  ),
).pipe(
  Command.withDescription("Run a trusted local script and save changes."),
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

const url = Command.make(
  "url",
  {
    id: Argument.string("id").pipe(
      Argument.optional,
      Argument.withDescription("Note ID to open. Omit to show the graph root URL."),
    ),
    open: Flag.boolean("open").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Open the URL in the default browser."),
    ),
  },
  Effect.fn("Cli.url")(
    function* ({ id, open }) {
      const config = yield* CliConfig.Service;
      const url = CliUrl.make(config, Option.getOrUndefined(id));
      yield* Console.log(url);

      if (!open) return;

      yield* CliUrl.open(url);
    },
    flow(Effect.provide(CliConfig.layerFromFile), Effect.provide(CliPaths.layer)),
  ),
).pipe(Command.withDescription("Print a web URL for a note or the graph root."));

const syncAndWrite = Effect.fn("Cli.syncAndWrite")(function* () {
  yield* Effect.gen(function* () {
    yield* CliSync.run();
    yield* writeSyncedChanges();
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
});

const writeSyncedChanges = Effect.fn("Cli.writeSyncedChanges")(function* () {
  const materializer = yield* Materializer.Service;
  yield* materializer.catchUp();
  yield* MaterializedFiles.writeAll();
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
  Command.withSubcommands([sync, init, execute, status, url]),
  Command.withGlobalFlags([CliPaths.DirFlag]),
);

const runnable = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  Effect.provide(Reactivity.layer),
);

NodeRuntime.runMain(runnable);
