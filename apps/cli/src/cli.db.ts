import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Layer, Schema } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as DB from "@manotes/shared/db.service";
import * as Migrator from "@manotes/shared/migrator";

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

// Node reads the CLI's generated migration journal and SQL files directly.
const MigrationJournal = Schema.Struct({
  entries: Schema.Array(Schema.Struct({ tag: Schema.String })),
});

const decodeMigrationJournal = Schema.decodeUnknownEffect(MigrationJournal);

const migrateNode = Effect.fn("CliDB.migrateNode")(function* () {
  const fs = yield* FileSystem.FileSystem;

  const journalText = yield* fs.readFileString(
    fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url)),
  );

  const journal = yield* decodeMigrationJournal(JSON.parse(journalText));

  const migrations = yield* Effect.forEach(journal.entries, ({ tag }) =>
    fs
      .readFileString(fileURLToPath(new URL(`../drizzle/${tag}.sql`, import.meta.url)))
      .pipe(Effect.map((sql) => ({ tag, sql }))),
  );

  yield* Migrator.migrate(migrations);
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

const REACTIVE_TABLES = ["notes", "events", "materialization_checkpoint", "backlinks"] as const;

export * as CliDB from "./cli.db";
