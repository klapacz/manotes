import { Array, Data, Effect, Layer, Context, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { Query } from "effect-qb";
import { DBUsedTables } from "./db.used-tables";
import * as Sqlite from "effect-qb/sqlite";

import { DBValues } from "./db.values";

export const values = DBValues.values;

export class Error extends Data.TaggedError("DB.Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedError("DB.NotFoundError")<{}> {}

export class Config extends Context.Service<
  Config,
  {
    localGraphId: string;
    databasePath: string;
  }
>()("DB.Config") {}

// Generic constraint only; each operation retains its concrete plan and inferred result.
export type Plan = Query.Plan.Any;

export class Service extends Context.Service<Service>()("DB", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const options = {
      valueMappings: { boolean: { toDriver: (value) => (decodeBoolean(value) ? 1 : 0) } },
    } satisfies Pick<Sqlite.Executor.MakeOptions, "valueMappings" | "reportInput">;

    const executor = Sqlite.Executor.make({
      ...options,
      driver: Sqlite.Executor.driver((statement) => sql.unsafe(statement.sql, statement.params)),
    });

    const query = Effect.fn("DB.query")(function* <P extends Plan>(
      plan: Query.DialectCompatiblePlan<P, "sqlite">,
    ) {
      return yield* executor.execute<P>(plan);
    });

    const find = Effect.fn("DB.find")(function* <P extends Plan>(
      plan: Query.DialectCompatiblePlan<P, "sqlite">,
    ) {
      return Array.head(yield* query<P>(plan));
    });

    const execute = Effect.fn("DB.execute")(function* <P extends Plan>(
      plan: Query.DialectCompatiblePlan<P, "sqlite">,
    ) {
      yield* query<P>(plan);
    });

    const reactiveQuery = Effect.fn("DB.reactiveQuery")(function* <P extends Plan>(
      plan: Query.DialectCompatiblePlan<P, "sqlite">,
    ) {
      return yield* Effect.sync(() => sql.reactive(DBUsedTables.usedTables(plan), query<P>(plan)));
    });

    return { transaction: sql.withTransaction, query, find, execute, reactiveQuery };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

const decodeBoolean = Schema.decodeUnknownSync(Schema.Boolean);

export * as DB from "./db.service";
