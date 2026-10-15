import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { SqliteWasmClient } from "@manotes/sql-sqlite-wasm/sqlite-client";
import { DB } from "@manotes/shared/db.service";
import { SqlLive } from "../../db/sql-live";
import { Migrator } from "../../migrator";
import { GraphRuntimeDBResolution } from "./db-resolution";

// TODO: use the same log level for migration and for the app
export const layer = Effect.fnUntraced(function* (opts: { readonly localGraphId: string }) {
  const configLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      databasePath: GraphRuntimeDBResolution.getPath(opts.localGraphId),
    }),
  );

  const sqlLayer = Layer.provideMerge(SqlLive, configLayer);
  const dbLayer = Layer.provideMerge(DB.Service.layer, sqlLayer);
  const context = yield* Layer.build(dbLayer);

  yield* Migrator.migrate.pipe(Effect.provide(context));

  return Layer.succeedContext(
    context.pipe(
      Context.pick(DB.Config, DB.Service, SqliteWasmClient.SqliteClient, SqlClient.SqlClient),
    ),
  );
}, Layer.unwrap);

export * as GraphDatabase from "./database";
