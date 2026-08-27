import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Layer } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as DB from "../lib/db.service";

const layerSQL = Layer.effect(
  SqlClient.SqlClient,
  Effect.gen(function* () {
    const config = yield* DB.Config;

    return yield* SqliteClient.make({ filename: config.databasePath });
  }),
);

const layerDB = Layer.provideMerge(DB.Service.layer, layerSQL);

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const context = yield* Layer.build(layerDB);

    yield* migrateNode().pipe(Effect.provide(context));
    yield* installReactivityHooks().pipe(
      Effect.provide(context),
      Effect.catchCause((cause) => Effect.logError("Reactivity failed", cause)),
      Effect.forkScoped,
    );

    return context;
  }),
);

// The shared Migrator imports apps/web/drizzle/migrations.ts, which relies on
// Vite's import.meta.glob. The CLI runs directly in Node, so load migration SQL
// files manually from the Drizzle journal instead.
const migrateNode = Effect.fn("CliDB.migrateNode")(function* () {
  const db = yield* DB.Service;
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;
  const journalText = yield* fs.readFileString(
    fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url)),
  );
  const journal = JSON.parse(journalText);

  yield* db.transaction(
    Effect.gen(function* () {
      yield* sql.unsafe(
        `CREATE TABLE IF NOT EXISTS _drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          name TEXT NOT NULL,
          hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );`,
      );

      const appliedMigrations = yield* sql.unsafe<{ hash: string }>(
        `SELECT hash FROM _drizzle_migrations;`,
      );

      for (const migration of journal.entries as ReadonlyArray<{ tag: string }>) {
        const migrationSql = yield* fs.readFileString(
          fileURLToPath(new URL(`../../drizzle/${migration.tag}.sql`, import.meta.url)),
        );
        const hash = yield* createHash(migrationSql);

        if (appliedMigrations.some((applied) => applied.hash === hash)) {
          continue;
        }

        for (const statement of splitSqlStatements(migrationSql)) {
          yield* sql.unsafe(statement, []);
        }
        yield* sql.unsafe(
          `INSERT INTO _drizzle_migrations ("name", "hash", "created_at") VALUES (?, ?, ?);`,
          [migration.tag, hash, Date.now()],
        );
      }
    }),
  );
});

const installReactivityHooks = Effect.fn("CliDB.installReactivityHooks")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const reactivity = yield* Reactivity.Reactivity;

  yield* sql.unsafe(
    `CREATE TEMP TABLE IF NOT EXISTS _manotes_reactivity_invalidations (
      table_name TEXT NOT NULL
    );`,
  );

  for (const table of REACTIVE_TABLES) {
    const triggerPrefix = `_manotes_reactivity_${table}`;
    const tableName = sql.literal(`'${table}'`);

    yield* sql`CREATE TEMP TRIGGER IF NOT EXISTS ${sql(`${triggerPrefix}_insert`)}
      AFTER INSERT ON ${sql(table)}
      BEGIN
        INSERT INTO _manotes_reactivity_invalidations (table_name) VALUES (${tableName});
      END`;
    yield* sql`CREATE TEMP TRIGGER IF NOT EXISTS ${sql(`${triggerPrefix}_update`)}
      AFTER UPDATE ON ${sql(table)}
      BEGIN
        INSERT INTO _manotes_reactivity_invalidations (table_name) VALUES (${tableName});
      END`;
    yield* sql`CREATE TEMP TRIGGER IF NOT EXISTS ${sql(`${triggerPrefix}_delete`)}
      AFTER DELETE ON ${sql(table)}
      BEGIN
        INSERT INTO _manotes_reactivity_invalidations (table_name) VALUES (${tableName});
      END`;
  }

  while (true) {
    const invalidations = yield* sql.unsafe<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM _manotes_reactivity_invalidations;`,
    );

    if (invalidations.length > 0) {
      yield* sql.unsafe(`DELETE FROM _manotes_reactivity_invalidations;`);
      yield* reactivity.invalidate(invalidations.map((row) => row.table_name));
    }

    yield* Effect.sleep("100 millis");
  }
});

const createHash = Effect.fn("CliDB.createHash")(function* (input: string) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
});

const REACTIVE_TABLES = ["notes", "events", "materialization_checkpoint", "backlinks"] as const;

function splitSqlStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export * as CliDB from "./cli.db";
