// This script is used for testing migrations locally

import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect, Migrator } from "kysely";

const dialect = new SqliteDialect({
  database: new SQLite("./local.db"),
});

export const db = new Kysely({
  dialect,
});

export const migrator = new Migrator({
  db,
  provider: {
    async getMigrations() {
      const { migrations } = await import("../sqlocal/migrations/index");
      return migrations;
    },
  },
});

const { error } = await migrator.migrateToLatest();

console.log(error);
