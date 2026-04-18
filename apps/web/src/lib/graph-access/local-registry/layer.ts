import { Effect, Context, Layer as EffectLayer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@manotes/sql-sqlite-wasm/sqlite-client";
import * as Repo from "./repo";

const REGISTRY_DATABASE_PATH = "local-registry.sqlite3";

const BaseLayer = SqliteClient.layer({
  worker: Effect.gen(function* () {
    const worker = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Worker(new URL("../../db/worker.ts", import.meta.url), {
            type: "module",
            name: "wa-sqlite-worker-local-registry",
          }),
      ),
      (worker) => Effect.sync(() => worker.terminate()),
    );

    return worker;
  }),
  initMessage: { dbName: REGISTRY_DATABASE_PATH },
  installReactivityHooks: true,
});

export const Layer = EffectLayer.unwrap(
  Effect.gen(function* () {
    const context = yield* EffectLayer.build(BaseLayer);
    yield* Repo.migrate.pipe(Effect.provide(context));
    return EffectLayer.succeedContext(
      context.pipe(Context.pick(SqliteClient.SqliteClient, SqlClient.SqlClient)),
    );
  }),
);
