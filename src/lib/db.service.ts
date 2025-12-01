import { Effect, Data, Context, Option, Exit } from "effect";
import { type Transaction } from "sqlocal";

import type { RunnableQuery as DrizzleQuery } from "drizzle-orm/runnable-query";
import { SQLocalDrizzle } from "sqlocal/drizzle";

import { drizzle as createDrizzle } from "drizzle-orm/sqlite-proxy";

export class TransactionContext extends Context.Tag("DBTX")<
  TransactionContext,
  Transaction
>() {}

export class Error extends Data.TaggedError("DB.Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedError("DB.NotFoundError")<{}> {}

export class Service extends Effect.Service<Service>()("DB", {
  effect: Effect.gen(function* () {
    const sqlocal = new SQLocalDrizzle("database.sqlite3");

    const drizzle = createDrizzle(sqlocal.driver, sqlocal.batchDriver);

    const transaction = Effect.fn("DB.Transaction")(function* <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) {
      const tx = yield* Effect.serviceOption(TransactionContext);

      if (Option.isSome(tx)) {
        return yield* effect.pipe(
          Effect.provideService(TransactionContext, tx.value),
        );
      }

      const acquire = Effect.tryPromise({
        try: () => sqlocal.beginTransaction(),
        catch: (cause) => new Error({ cause }),
      });

      return yield* Effect.acquireUseRelease(
        acquire,
        (tx) => effect.pipe(Effect.provideService(TransactionContext, tx)),
        (tx, exit) => {
          return Effect.promise(() =>
            Exit.isSuccess(exit) ? tx.commit() : tx.rollback(),
          );
        },
      );
    });

    type QueryCallbackFn<T> = (db: typeof drizzle) => DrizzleQuery<T, "sqlite">;

    const query = Effect.fn("DB.query")(function* <T>(cb: QueryCallbackFn<T>) {
      const tx = yield* Effect.serviceOption(TransactionContext);

      return yield* Effect.tryPromise({
        try: async () => {
          const statement = cb(drizzle);

          if (Option.isSome(tx)) {
            return tx.value.query(statement) as T; // Run within transaction
          }
          return (await (statement as never as Promise<T>)) as T; // Invoke query by awaiting it
        },
        catch: (cause) => new Error({ cause }),
      });
    });

    const find = Effect.fn("DB.find")(function* <T extends Array<any>>(
      cb: QueryCallbackFn<T>,
    ) {
      const [result] = yield* query(cb);
      return Option.fromNullable(result as T[number]);
    });

    return {
      transaction,
      sqlocal,
      query,
      find,
    };
  }),
}) {}
