import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import * as DB from "../lib/db.service";

export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const context = yield* Layer.build(DB.Service.layer);

    yield* migrate().pipe(Effect.provide(context));
    yield* installReactivityHooks().pipe(
      Effect.provide(context),
      Effect.catchCause((cause) => Effect.logError("Reactivity failed", cause)),
    );

    return context;
  }),
);

// The shared Migrator imports apps/web/drizzle/migrations.ts, which relies on
// Vite's import.meta.glob. The CLI and TUI load migration SQL directly from
// the Drizzle journal instead.
const MigrationJournal = Schema.Struct({
  entries: Schema.Array(Schema.Struct({ tag: Schema.String })),
});

const decodeMigrationJournal = Schema.decodeUnknownEffect(MigrationJournal);

const migrate = Effect.fn("CliDatabase.migrate")(function* () {
  const db = yield* DB.Service;
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;

  const journalText = yield* fs.readFileString(
    fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url)),
  );

  const journal = yield* decodeMigrationJournal(JSON.parse(journalText));

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

      for (const migration of journal.entries) {
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

const installReactivityHooks = Effect.fn("CliDatabase.installReactivityHooks")(function* () {
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

  const drainInvalidations = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ table_name: Schema.String }),
    execute: () => sql`DELETE FROM _manotes_reactivity_invalidations RETURNING table_name`,
  });

  const readDataVersion = SqlSchema.findOne({
    Request: Schema.Void,
    Result: Schema.Struct({ data_version: Schema.Number }),
    execute: () => sql`PRAGMA data_version`,
  });

  let dataVersion = (yield* readDataVersion()).data_version;

  // Capture the baseline before consumers can query. Otherwise an external write
  // between their initial query and hook startup can go unnoticed.
  yield* Effect.gen(function* () {
    while (true) {
      // A write between separate SELECT/DELETE statements could lose its invalidation.
      const invalidations = yield* drainInvalidations();

      if (invalidations.length > 0) {
        yield* reactivity.invalidate([...new Set(invalidations.map((row) => row.table_name))]);
      }

      // TEMP triggers only see this connection. CLI writes use a different one.
      const currentVersion = (yield* readDataVersion()).data_version;

      if (currentVersion !== dataVersion) {
        dataVersion = currentVersion;
        yield* reactivity.invalidate(REACTIVE_TABLES);
      }

      yield* Effect.sleep("100 millis");
    }
  }).pipe(
    Effect.catchCause((cause) => Effect.logError("Reactivity failed", cause)),
    Effect.forkScoped,
  );
});

const createHash = Effect.fn("CliDatabase.createHash")(function* (input: string) {
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
