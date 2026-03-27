// migrate.ts
import { Data, Effect, LogLevel } from "effect";
import { migrations } from "../../drizzle/migrations";
import * as DB from "./db.service";
import { SqlClient, SqlError } from "@effect/sql";

class Error extends Data.TaggedError("Migrator.Error")<{
  cause: SqlError.SqlError;
}> {}

const MIGRATIONS_TABLE_NAME = "_drizzle_migrations";

export const migrate = Effect.gen(function* () {
  const db = yield* DB.Service;

  yield* db.transaction(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* sql.unsafe(
        `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          name TEXT NOT NULL,
          hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );`,
      );

      yield* Effect.logWithLevel(LogLevel.Debug, "Table created");

      const appliedMigrations = yield* sql.unsafe<{
        id: number;
        name: string;
        hash: string;
        created_at: number;
      }>(`SELECT * FROM ${MIGRATIONS_TABLE_NAME};`);

      yield* Effect.logWithLevel(LogLevel.Debug, "Applied migrations fetched");

      for (const migration of migrations) {
        const hash = yield* createHash(migration.sql);

        if (appliedMigrations.some((m) => m.hash === hash)) {
          continue;
        }

        yield* sql.unsafe(migration.sql, []);

        yield* sql.unsafe(
          `INSERT INTO ${MIGRATIONS_TABLE_NAME} ("name", "hash", "created_at") VALUES (?, ?, ?);`,
          [migration.tag, hash, Date.now()],
        );
      }
    }),
  );
}).pipe(Effect.mapError((cause) => new Error({ cause })));

const createHash = Effect.fn(function* (input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hash;
});
