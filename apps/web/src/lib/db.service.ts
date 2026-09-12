import { Data, Effect, Layer, Option, Context, Predicate, Schema } from "effect";

import type { RunnableQuery as DrizzleQuery } from "drizzle-orm/runnable-query";

import { drizzle as createDrizzle } from "drizzle-orm/sqlite-proxy";
import { SqlClient } from "effect/unstable/sql";
import type { Query } from "drizzle-orm";
import * as SqliteClient from "@manotes/sql-sqlite-wasm/sqlite-client";

export const SqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* Config;

    return SqliteClient.layer({
      worker: Effect.gen(function* () {
        const worker = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new Worker(new URL("./db/worker.ts", import.meta.url), {
                type: "module",
                name: `wa-sqlite-worker-${config.localGraphId}`,
              }),
          ),
          (worker) => Effect.sync(() => worker.terminate()),
        );

        return worker;
      }),
      initMessage: { dbName: config.databasePath },
      installReactivityHooks: true,
    });
  }),
);

export class Error extends Data.TaggedError("DB.Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedError("DB.NotFoundError")<{}> {}

export class Config extends Context.Service<
  Config,
  {
    localGraphId: string;
    databasePath: string;
  }
>()("DB.Config") {}

export class Service extends Context.Service<Service>()("DB", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // dummy drizzle proxy - we use drizzle only for query building
    const drizzle = createDrizzle(async () => ({ rows: [] }));

    const transaction = sql.withTransaction;

    type QueryCallbackFn<T> = (
      db: typeof drizzle,
    ) => DrizzleQuery<T, "sqlite"> & { toSQL(): Query };

    const reactiveQuery = Effect.fn("DB.reactiveQuery")(function* <T extends object[]>(
      cb: QueryCallbackFn<T>,
    ) {
      const query = cb(drizzle);
      const statement = query.toSQL();

      return sql.reactive(
        yield* getUsedTables(query),
        sql.unsafe<T[number]>(statement.sql, statement.params),
      );
    });

    const query = Effect.fn("DB.query")(function* <T extends object[]>(cb: QueryCallbackFn<T>) {
      const query = cb(drizzle);
      const statement = query.toSQL();

      return yield* sql.unsafe<T[number]>(statement.sql, statement.params);
    });

    const find = Effect.fn("DB.find")(function* <T extends object[]>(cb: QueryCallbackFn<T>) {
      const [result] = yield* query<T>(cb);

      return Option.fromNullishOr(result);
    });

    return {
      transaction,
      query,
      reactiveQuery,
      find,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

const decodeUsedTables = Schema.decodeUnknownEffect(Schema.Array(Schema.String));

const getUsedTables = Effect.fnUntraced(function* <T>(query: DrizzleQuery<T, "sqlite">) {
  if (!("getUsedTables" in query) || !Predicate.isFunction(query.getUsedTables)) {
    return yield* Effect.die("Provided query is not a valid Drizzle query");
  }

  return yield* decodeUsedTables(query.getUsedTables()).pipe(Effect.orDie);
});
