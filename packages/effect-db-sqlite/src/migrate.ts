import { Data, Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { EffectDbSqliteScript } from "./script";

export interface Migration {
  readonly tag: string;
  readonly sql: string;
}

export class MigrationError extends Data.TaggedError("EffectDbSqlite.MigrationError")<{
  readonly message: string;
}> {}

export const migrate = Effect.fn("EffectDbSqliteMigrate.migrate")(function* (
  migrations: readonly Migration[],
) {
  const sql = yield* SqlClient.SqlClient;

  if (Option.isSome(yield* Effect.serviceOption(sql.transactionService))) {
    return yield* Effect.fail(
      new MigrationError({ message: "Migrations must run outside a transaction" }),
    );
  }

  if (new Set(migrations.map((migration) => migration.tag)).size !== migrations.length) {
    return yield* Effect.fail(new MigrationError({ message: "Duplicate migration tags" }));
  }

  // shortcut: Drizzle's foreign_keys PRAGMAs run inside this transaction and cannot disable
  // enforcement. Parent-table rebuilds can cascade-delete children; fix before adding foreign keys.
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`CREATE TABLE IF NOT EXISTS __effectdb_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )`;
      const applied = yield* listApplied(undefined);

      for (const migration of migrations) {
        const checksum = yield* createChecksum(migration.sql);
        const previous = applied.find((entry) => entry.name === migration.tag);

        if (previous !== undefined) {
          if (previous.checksum !== checksum) {
            return yield* Effect.fail(
              new MigrationError({ message: `Applied migration changed: ${migration.tag}` }),
            );
          }

          continue;
        }

        for (const statement of EffectDbSqliteScript.splitStatements(migration.sql))
          yield* sql.unsafe(statement, []);
        yield* sql`INSERT INTO __effectdb_migrations (name, checksum, applied_at)
          VALUES (${migration.tag}, ${checksum}, ${Date.now()})`;
      }
    }),
  );
});

const listApplied = SqlSchema.findAll({
  Request: Schema.Void,
  Result: Schema.Struct({ name: Schema.String, checksum: Schema.String }),
  execute: Effect.fn("EffectDbSqliteMigrate.listApplied.execute")(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`SELECT name, checksum FROM __effectdb_migrations`;
  }),
});

const createChecksum = Effect.fn("EffectDbSqliteMigrate.createChecksum")(function* (sql: string) {
  const bytes = new TextEncoder().encode(sql.replaceAll("\r\n", "\n"));
  const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", bytes));

  return (
    "sha256:" +
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
});

export * as EffectDbSqliteMigrate from "./migrate";
