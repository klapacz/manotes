import { entries } from "./meta/_journal.json";

const migrationFiles = import.meta.glob("./*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const migrations = entries.map((migration) => {
  const sql = migrationFiles[`./${migration.tag}.sql`] as string | undefined;
  if (!sql) {
    throw new Error(`Migration file not found for tag: ${migration.tag}`);
  }
  return {
    ...migration,
    sql,
  };
});
