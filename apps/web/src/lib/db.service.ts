import { Data, Effect, Layer, Option, Context } from "effect";

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

    type QueryCallbackFn<T> = (db: typeof drizzle) => DrizzleQuery<T, "sqlite">;

    const reactiveQuery = Effect.fn("DB.reactiveQuery")(function* <T extends object[]>(
      cb: QueryCallbackFn<T>,
    ) {
      const query = cb(drizzle);
      const statement = yield* queryToSQL(query);

      return sql.reactive(
        yield* getUsedTables(query),
        sql.unsafe<T[number]>(statement.sql, statement.params as ReadonlyArray<unknown>),
      );
    });

    const query = Effect.fn("DB.query")(function* <T extends object[]>(cb: QueryCallbackFn<T>) {
      const query = cb(drizzle);
      const statement = yield* queryToSQL(query);

      return yield* sql.unsafe<T[number]>(
        statement.sql,
        statement.params as ReadonlyArray<unknown>,
      );
    });

    const find = Effect.fn("DB.find")(function* <T extends object[]>(cb: QueryCallbackFn<T>) {
      const [result] = yield* query(cb);
      return Option.fromNullishOr(result as T[number]);
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

const queryToSQL = Effect.fnUntraced(function* (query: DrizzleQuery<any, "sqlite">) {
  if (!("toSQL" in query) || typeof query.toSQL !== "function") {
    return yield* Effect.die("Provided query is not a valid Drizzle query");
  }

  return query.toSQL() as Query;
});

const getUsedTables = Effect.fnUntraced(function* (query: DrizzleQuery<any, "sqlite">) {
  if (!("getUsedTables" in query) || typeof query.getUsedTables !== "function") {
    return yield* Effect.die("Provided query is not a valid Drizzle query");
  }

  return query.getUsedTables() as string[];
});
