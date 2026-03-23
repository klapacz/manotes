import { Effect, Data, Context, Layer, Option } from "effect";

import type { RunnableQuery as DrizzleQuery } from "drizzle-orm/runnable-query";

import { drizzle as createDrizzle } from "drizzle-orm/sqlite-proxy";
import * as OPFS from "./opfs.service";
import { SqlClient } from "@effect/sql";
import type { Primitive } from "@effect/sql/Statement";
import type { Query } from "drizzle-orm";
import * as SqliteClient from "./sql-sqlite-wasm/sqlite-client";

export const SqlLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* Config;

    const doesFileExist = yield* OPFS.getFileHandleFromOpfsRoot(
      config.databasePath,
    ).pipe(
      Effect.map(() => true),
      Effect.catchTag("NotFoundError", () => Effect.succeed(false)),
    );

    if (!doesFileExist && !config.allowCreate) {
      return yield* new NotFoundError();
    }

    return SqliteClient.layer({
      worker: Effect.gen(function* () {
        const worker = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new Worker(
                new URL("./db/worker.ts", import.meta.url),
                {
                  type: "module",
                  name: `wa-sqlite-worker-${config.localGraphId}`,
                },
              ),
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

export class Config extends Context.Tag("DB.Config")<
  Config,
  {
    localGraphId: string;
    displayName: string;
    databasePath: string;
    allowCreate: boolean;
  }
>() {}

export class Service extends Effect.Service<Service>()("DB", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // dummy drizzle proxy - we use drizzle only for query building
    const drizzle = createDrizzle(async () => ({ rows: [] }));

    const transaction = sql.withTransaction;

    type QueryCallbackFn<T> = (db: typeof drizzle) => DrizzleQuery<T, "sqlite">;

    const reactiveQuery = Effect.fn("DB.reactiveQuery")(function* <
      T extends object[],
    >(cb: QueryCallbackFn<T>) {
      const query = cb(drizzle);
      const statement = yield* queryToSQL(query);

      return sql.reactive(
        yield* getUsedTables(query),
        sql.unsafe<T[number]>(statement.sql, statement.params as Primitive[]),
      );
    });

    const query = Effect.fn("DB.query")(function* <T extends object[]>(
      cb: QueryCallbackFn<T>,
    ) {
      const query = cb(drizzle);
      const statement = yield* queryToSQL(query);

      return yield* sql.unsafe<T[number]>(
        statement.sql,
        statement.params as Primitive[],
      );
    });

    const find = Effect.fn("DB.find")(function* <T extends object[]>(
      cb: QueryCallbackFn<T>,
    ) {
      const [result] = yield* query(cb);
      return Option.fromNullable(result as T[number]);
    });

    return {
      transaction,
      query,
      reactiveQuery,
      find,
    };
  }),
}) {}

const queryToSQL = Effect.fnUntraced(function* (
  query: DrizzleQuery<any, "sqlite">,
) {
  if (!("toSQL" in query) || typeof query.toSQL !== "function") {
    return yield* Effect.die("Provided query is not a valid Drizzle query");
  }

  return query.toSQL() as Query;
});

const getUsedTables = Effect.fnUntraced(function* (
  query: DrizzleQuery<any, "sqlite">,
) {
  if (
    !("getUsedTables" in query) ||
    typeof query.getUsedTables !== "function"
  ) {
    return yield* Effect.die("Provided query is not a valid Drizzle query");
  }

  return query.getUsedTables() as string[];
});
