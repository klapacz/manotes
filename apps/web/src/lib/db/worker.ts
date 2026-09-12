import { Effect } from "effect";
import { run } from "@manotes/sql-sqlite-wasm/opfs-worker";

// Wait for config message with dbName before initializing the database.
// The sqlite-client posts this as an initMessage right after worker creation.
self.addEventListener(
  "message",
  (event: MessageEvent<{ dbName: string }>) => {
    const { dbName } = event.data;

    // SAFETY: This entrypoint runs in a worker; the app's DOM types describe self as Window.
    void run({ port: self as any, dbName }).pipe(Effect.runPromise);
  },
  { once: true },
);
