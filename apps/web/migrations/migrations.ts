const migrationFiles = import.meta.glob<string>("./*/migration.sql", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const migrations = Object.entries(migrationFiles)
  .toSorted(([a], [b]) => a.localeCompare(b))
  .map(([file, sql]) => ({ tag: file.slice(2, -"/migration.sql".length), sql }));

export * as Migrations from "./migrations";
