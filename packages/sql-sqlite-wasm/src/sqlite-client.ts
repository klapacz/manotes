/**
 * Adapted from Effect's `packages/sql/sqlite-wasm/src/SqliteClient.ts`; the
 * copied revision was not recorded. Local changes add worker initialization
 * and cooperative OPFS wiring.
 */
/* eslint-disable anti-slop/no-known-value-widening, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Preserve the copied Effect client's dynamic worker protocol and casts. */

/**
 * @since 1.0.0
 */
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import * as Client from "effect/unstable/sql/SqlClient";
import type { Connection } from "effect/unstable/sql/SqlConnection";
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError";
import * as Statement from "effect/unstable/sql/Statement";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { identity } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import * as Context from "effect/Context";
import * as Scope from "effect/Scope";
import * as ScopedRef from "effect/ScopedRef";
import * as Stream from "effect/Stream";
import type { OpfsWorkerMessage } from "./internal/opfs-worker";

const ATTR_DB_SYSTEM_NAME = "db.system.name";

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation });

/**
 * @category type ids
 * @since 1.0.0
 */
export const TypeId = "~@effect/sql-sqlite-wasm/SqliteClient";

/**
 * @category type ids
 * @since 1.0.0
 */
export type TypeId = "~@effect/sql-sqlite-wasm/SqliteClient";

/**
 * @category models
 * @since 1.0.0
 */
export interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId;
  readonly config: SqliteClientConfig;
  readonly export: Effect.Effect<Uint8Array, SqlError>;
  readonly import: (data: Uint8Array) => Effect.Effect<void, SqlError>;

  /** Not supported in sqlite */
  readonly updateValues: never;
}

/**
 * @category tags
 * @since 1.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-wasm/SqliteClient");

/**
 * @category models
 * @since 1.0.0
 */
export interface SqliteClientConfig {
  readonly worker: Effect.Effect<Worker | SharedWorker | MessagePort, never, Scope.Scope>;
  /** Message posted to the worker immediately after creation, before waiting
   *  for the "ready" handshake. Use this to send configuration (e.g. dbName)
   *  that the worker needs before it can initialize. */
  readonly initMessage?: unknown;
  readonly installReactivityHooks?: boolean;
  readonly spanAttributes?: Record<string, unknown>;
  readonly transformResultNames?: (str: string) => string;
  readonly transformQueryNames?: (str: string) => string;
}

interface SqliteConnection extends Connection {
  readonly export: Effect.Effect<Uint8Array, SqlError>;
  readonly import: (data: Uint8Array) => Effect.Effect<void, SqlError>;
}

/**
 * @category constructor
 * @since 1.0.0
 */
export const make = (
  options: SqliteClientConfig,
): Effect.Effect<SqliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function* () {
    const reactivity = yield* Reactivity.Reactivity;
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames);

    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined;

    const pending = new Map<number, (effect: Exit.Exit<any, SqlError>) => void>();

    const makeConnection = Effect.gen(function* () {
      let currentId = 0;
      const scope = yield* Effect.scope;
      const readyDeferred = yield* Deferred.make<void>();

      const worker = yield* options.worker;
      const port = "port" in worker ? worker.port : worker;

      const postMessage = (message: OpfsWorkerMessage, transferables?: ReadonlyArray<any>) =>
        port.postMessage(message, transferables as any);

      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => postMessage(["close"])),
      );

      const onMessage = (event: any) => {
        const [id, error, results] = event.data;

        if (id === "ready") {
          Deferred.doneUnsafe(readyDeferred, Exit.void);

          return;
        } else if (id === "update_hook") {
          reactivity.invalidateUnsafe({ [error]: [results] });

          return;
        } else {
          const resume = pending.get(id);

          if (!resume) return;
          pending.delete(id);

          if (error) {
            resume(
              Exit.fail(
                new SqlError({
                  reason: classifyError(error as string, "Failed to execute statement", "execute"),
                }),
              ),
            );
          } else {
            resume(Exit.succeed(results));
          }
        }
      };

      port.addEventListener("message", onMessage);

      function onError() {
        Effect.runFork(ScopedRef.set(connectionRef, makeConnection));
      }

      if ("onerror" in worker) {
        worker.addEventListener("error", onError);
      }

      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        }),
      );

      if (options.initMessage !== undefined) {
        port.postMessage(options.initMessage);
      }

      yield* Deferred.await(readyDeferred);

      if (options.installReactivityHooks) {
        postMessage(["update_hook"]);
      }

      const send = (id: number, message: OpfsWorkerMessage, transferables?: ReadonlyArray<any>) =>
        Effect.callback<any, SqlError>((resume) => {
          pending.set(id, resume);
          postMessage(message, transferables);
        });

      const run = (
        sql: string,
        params: ReadonlyArray<unknown> = [],
        rowMode: "object" | "array" = "object",
      ): Effect.Effect<Array<any>, SqlError, never> => {
        const rows = Effect.withFiber<[Array<string>, Array<any>], SqlError>((fiber) => {
          const id = currentId++;

          return send(id, [id, sql, params], fiber.getRef(Transferables));
        });

        return rowMode === "object"
          ? Effect.map(rows, extractObject)
          : Effect.map(rows, extractRows);
      };

      return identity<SqliteConnection>({
        execute(sql, params, transformRows) {
          return transformRows ? Effect.map(run(sql, params), transformRows) : run(sql, params);
        },
        executeRaw(sql, params) {
          return run(sql, params);
        },
        executeValues(sql, params) {
          return run(sql, params, "array");
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows);
        },
        executeStream() {
          return Stream.die("executeStream not implemented");
        },
        export: Effect.suspend(() => {
          const id = currentId++;

          return send(id, ["export", id]);
        }),
        import(data) {
          return Effect.suspend(() => {
            const id = currentId++;

            return send(id, ["import", id, data], [data.buffer]);
          });
        },
      });
    });

    const connectionRef = yield* ScopedRef.fromAcquire(makeConnection);

    const semaphore = yield* Semaphore.make(1);
    const acquirer = semaphore.withPermits(1)(ScopedRef.get(connectionRef));

    const transactionAcquirer = Effect.uninterruptibleMask(
      Effect.fnUntraced(function* (restore) {
        const fiber = Fiber.getCurrent()!;
        const scope = Context.getUnsafe(fiber.context, Scope.Scope);
        yield* restore(semaphore.take(1));
        yield* Scope.addFinalizer(scope, semaphore.release(1));

        return yield* ScopedRef.get(connectionRef);
      }),
    );

    return Object.assign(
      (yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        spanAttributes: [
          ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
          [ATTR_DB_SYSTEM_NAME, "sqlite"],
        ],
        transformRows,
      })) as SqliteClient,
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        export: Effect.flatMap(acquirer, (connection) => connection.export),
        import(data: Uint8Array) {
          return Effect.flatMap(acquirer, (connection) => connection.import(data));
        },
      },
    );
  });

function rowToObject(columns: Array<string>, row: Array<any>) {
  const obj: Record<string, any> = {};

  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]!] = row[i];
  }

  return obj;
}

const extractObject = (rows: [Array<string>, Array<any>]) =>
  rows[1].map((row) => rowToObject(rows[0], row));

const extractRows = (rows: [Array<string>, Array<any>]) => rows[1];

/**
 * @category tranferables
 * @since 1.0.0
 */
export const Transferables = Context.Reference<ReadonlyArray<Transferable>>(
  "@effect/sql-sqlite-wasm/currentTransferables",
  { defaultValue: () => [] },
);

/**
 * @category tranferables
 * @since 1.0.0
 */
export const withTransferables =
  (transferables: ReadonlyArray<Transferable>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.provideService(effect, Transferables, transferables);

/**
 * @category layers
 * @since 1.0.0
 */
export const layer = (
  config: SqliteClientConfig,
): Layer.Layer<SqliteClient | Client.SqlClient, SqlError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(SqliteClient, client).pipe(Context.add(Client.SqlClient, client)),
    ),
  ).pipe(Layer.provide(Reactivity.layer));
