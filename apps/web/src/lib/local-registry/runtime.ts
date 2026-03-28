import { Effect, ManagedRuntime, ServiceMap, Stream } from "effect";
import * as Layer from "effect/Layer";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@manotes/sql-sqlite-wasm/sqlite-client";
import * as Primitives from "../primitives";
import * as Repo from "./repo";

const REGISTRY_DATABASE_PATH = "local-registry.sqlite3";

const RegistryBaseLayer = SqliteClient.layer({
  worker: Effect.gen(function* () {
    const worker = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Worker(new URL("../db/worker.ts", import.meta.url), {
            type: "module",
            name: "wa-sqlite-worker-local-registry",
          }),
      ),
      (worker) => Effect.sync(() => worker.terminate()),
    );

    return worker;
  }),
  initMessage: { dbName: REGISTRY_DATABASE_PATH },
});

const RegistryLive = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* Layer.build(RegistryBaseLayer);
    yield* Repo.migrate.pipe(Effect.provide(context));
    return Layer.succeedServices(
      context.pipe(ServiceMap.pick(SqliteClient.SqliteClient, SqlClient.SqlClient)),
    );
  }),
);

export const runtime = ManagedRuntime.make(RegistryLive);

type RegistryRuntimeRequirements = SqlClient.SqlClient | SqliteClient.SqliteClient;

export function createStreamStore<A extends object, E>(
  stream: () => Stream.Stream<A, E, RegistryRuntimeRequirements>,
  staticInitialValue: NoInfer<A>,
) {
  return Primitives.createStreamStore(
    () => ({
      runtime,
      stream: stream(),
    }),
    staticInitialValue,
  );
}
