import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import * as DB from "./db.service";

export interface Migration {
  readonly tag: string;
  readonly sql: string;
}

export const migrate = Effect.fn("Migrator.migrate")(function* (
  migrations: ReadonlyArray<Migration>,
) {
  const db = yield* DB.Service;
  const sql = yield* SqlClient.SqlClient;

  yield* db.transaction(
    Effect.gen(function* () {
      yield* sql`CREATE TABLE IF NOT EXISTS _drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );`;

      yield* Effect.logDebug("Table created");
      const appliedMigrations = yield* listApplied(undefined);
      yield* Effect.logDebug("Applied migrations fetched");

      for (const migration of migrations) {
        const hash = yield* createHash(migration.sql);

        if (appliedMigrations.some((applied) => applied.hash === hash)) continue;

        for (const statement of splitSqlStatements(migration.sql)) {
          yield* sql.unsafe(statement, []);
        }

        yield* sql`INSERT INTO _drizzle_migrations (name, hash, created_at)
          VALUES (${migration.tag}, ${hash}, ${Date.now()});`;
      }
    }),
  );
});

const AppliedMigration = Schema.Struct({ hash: Schema.String });

const listApplied = SqlSchema.findAll({
  Request: Schema.Void,
  Result: AppliedMigration,
  execute: Effect.fn("Migrator.listApplied.execute")(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`SELECT hash FROM _drizzle_migrations;`;
  }),
});

const createHash = Effect.fn("Migrator.createHash")(function* (input: string) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
});

function splitSqlStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export * as Migrator from "./migrator";
