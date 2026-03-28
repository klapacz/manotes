/**
 * @since 1.0.0
 */
/// <reference lib="webworker" />
import * as WaSqlite from "wa-sqlite";
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import wasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";
import { OPFSCoopSyncVFS } from "wa-sqlite/src/examples/OPFSCoopSyncVFS";
import * as Effect from "effect/Effect";
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError";
import type { OpfsWorkerMessage } from "./internal/opfs-worker.js";

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation });

/**
 * @category models
 * @since 1.0.0
 */
export interface OpfsWorkerConfig {
  readonly port: EventTarget & Pick<MessagePort, "postMessage" | "close">;
  readonly dbName: string;
}

/**
 * @category constructor
 * @since 1.0.0
 */
export const run = (options: OpfsWorkerConfig): Effect.Effect<void, SqlError> =>
  Effect.gen(function* () {
    const factory = yield* Effect.promise(() => SQLiteESMFactory({ locateFile: () => wasmUrl }));
    const sqlite3 = WaSqlite.Factory(factory);
    const vfs = yield* Effect.promise(() => OPFSCoopSyncVFS.create("opfs", factory));
    sqlite3.vfs_register(vfs, false);
    const db = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => sqlite3.open_v2(options.dbName, undefined, "opfs"),
        catch: (cause) =>
          new SqlError({
            reason: classifyError(cause, "Failed to open database", "openDatabase"),
          }),
      }),
      (db) =>
        Effect.promise(async () => {
          await sqlite3.close(db);
        }),
    );

    return yield* Effect.callback<void>((resume) => {
      let updateBroadcast: BroadcastChannel | undefined;

      const onMessage = async (event: any) => {
        let messageId: number = -1; // custom: initialized here for catch block
        const message = event.data as OpfsWorkerMessage;
        try {
          switch (message[0]) {
            case "close": {
              updateBroadcast?.close();
              options.port.close();
              return resume(Effect.void);
            }
            case "import": {
              const [, id, data] = message;
              messageId = id;
              (sqlite3 as any).deserialize(db, "main", data, data.length, data.length, 1 | 2);
              options.port.postMessage([id, void 0, void 0]);
              return;
            }
            case "export": {
              const [, id] = message;
              messageId = id;
              const data = (sqlite3 as any).serialize(db, "main");
              options.port.postMessage([id, undefined, data], [data.buffer]);
              return;
            }
            // Custom: sqlite3_update_hook is per-connection and only fires
            // for changes made by that connection. Since each tab runs its
            // own worker with a separate WASM SQLite instance, we use a
            // BroadcastChannel to propagate change notifications across tabs.
            case "update_hook": {
              messageId = -1;
              updateBroadcast = new BroadcastChannel(`update_hook:${options.dbName}`);
              // Forward updates from other workers to our client
              updateBroadcast.onmessage = (e) => {
                options.port.postMessage(["update_hook", e.data[0], e.data[1]]);
              };
              sqlite3.update_hook(
                db,
                (_op: unknown, _db: unknown, table: unknown, rowid: unknown) => {
                  if (!table) return;
                  options.port.postMessage(["update_hook", table, Number(rowid)]);
                  // Broadcast to other workers
                  updateBroadcast!.postMessage([table, Number(rowid)]);
                },
              );
              return;
            }
            default: {
              const [id, sql, params] = message;
              messageId = id;
              const results: Array<any> = [];
              let columns: Array<string> | undefined;
              for await (const stmt of sqlite3.statements(db, sql)) {
                sqlite3.bind_collection(stmt, params as any);
                while ((await sqlite3.step(stmt)) === WaSqlite.SQLITE_ROW) {
                  columns = columns ?? sqlite3.column_names(stmt);
                  const row = sqlite3.row(stmt);
                  results.push(row);
                }
              }
              options.port.postMessage([id, undefined, [columns ?? [], results]]);
              return;
            }
          }
        } catch (e: any) {
          const message = "message" in e ? e.message : String(e);
          options.port.postMessage([messageId!, message, undefined]);
        }
      };
      options.port.addEventListener("message", onMessage);
      options.port.postMessage(["ready", undefined, undefined]);
      return Effect.sync(() => {
        options.port.removeEventListener("message", onMessage);
      });
    });
  }).pipe(Effect.scoped);
