// migrate.ts
import { Data, Effect, LogLevel } from "effect";
import { migrations } from "../../drizzle/migrations";
import { DB } from ".";

class Error extends Data.TaggedError("Migrator.Error")<{
  cause: DB.Error;
}> {}

const MIGRATIONS_TABLE_NAME = "_drizzle_migrations";

export const migrate = Effect.gen(function* () {
  const db = yield* DB.Service;

  yield* db.transaction(
    Effect.gen(function* () {
      const tx = yield* DB.TransactionContext;

      yield* Effect.promise(() =>
        tx.query({
          sql: `
            CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
              id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
              name TEXT NOT NULL,
              hash TEXT NOT NULL,
              created_at INTEGER NOT NULL
            );
          `,
          params: [],
        }),
      );

      yield* Effect.logWithLevel(LogLevel.Debug, "Table created");

      const appliedMigrations = yield* Effect.promise(() =>
        tx.query<{
          id: number;
          name: string;
          hash: string;
          created_at: number;
        }>({
          sql: `
            SELECT * FROM ${MIGRATIONS_TABLE_NAME};
          `,
          params: [],
        }),
      );

      yield* Effect.logWithLevel(LogLevel.Debug, "Applied migrations fetched");

      for (const migration of migrations) {
        const hash = yield* createHash(migration.sql);

        if (appliedMigrations.some((m) => m.hash === hash)) {
          continue;
        }

        yield* Effect.promise(() =>
          tx.query({
            sql: migration.sql,
            params: [],
          }),
        );

        yield* Effect.promise(() =>
          tx.query({
            sql: `
              INSERT INTO ${MIGRATIONS_TABLE_NAME} ("name", "hash", "created_at")
              VALUES (?, ?, ?);
            `,
            params: [migration.tag, hash, Date.now()],
          }),
        );
      }
    }),
  );
}).pipe(Effect.mapError((cause) => new Error({ cause })));

const createHash = Effect.fn(function* (input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = yield* Effect.promise(() =>
    crypto.subtle.digest("SHA-256", data),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hash;
});
