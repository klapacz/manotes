import { Effect, Data, Context, Option, Exit, Stream } from "effect";
import { type Transaction } from "sqlocal";

import type { RunnableQuery as DrizzleQuery } from "drizzle-orm/runnable-query";
import { SQLocalDrizzle } from "sqlocal/drizzle";

import { drizzle as createDrizzle } from "drizzle-orm/sqlite-proxy";
import { OPFS } from ".";

export class TransactionContext extends Context.Tag("DBTX")<
  TransactionContext,
  Transaction
>() {}

export class Error extends Data.TaggedError("DB.Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedError("DB.NotFoundError")<{}> {}

export class Config extends Context.Tag("DB.Config")<
  Config,
  { databasePath: string; allowCreate: boolean }
>() {}

export class Service extends Effect.Service<Service>()("DB", {
  effect: Effect.gen(function* () {
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

    // const config = yield* Config;
    const sqlocal = new SQLocalDrizzle({
      databasePath: config.databasePath,
      reactive: true,
    });

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

    const reactiveQuery = Effect.fn("DB.reactiveQuery")(function* <
      T extends Record<string, any>[],
    >(cb: QueryCallbackFn<T>) {
      return Stream.asyncPush<T>((emit) =>
        Effect.acquireRelease(
          // Acquire: subscribe and return the subscription handle
          Effect.sync(() => {
            const statement = cb(drizzle);
            const subscription = sqlocal
              .reactiveQuery(statement)
              .subscribe((data) => {
                emit.single(data as T); // Emit each value
              });
            return subscription;
          }),
          // Release: cleanup the subscription
          (subscription) => Effect.sync(() => subscription.unsubscribe()),
        ),
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
      reactiveQuery,
      find,
    };
  }),
}) {}
