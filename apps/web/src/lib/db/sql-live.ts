import { Effect, Layer } from "effect";
import * as SqliteClient from "@manotes/sql-sqlite-wasm/sqlite-client";
import { DB } from "@manotes/shared/db.service";

export const SqlLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DB.Config;

    return SqliteClient.layer({
      worker: Effect.gen(function* () {
        const worker = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new Worker(new URL("./worker.ts", import.meta.url), {
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
