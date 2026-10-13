import { Effect, FileSystem, Path } from "effect";

export const readMigrations = Effect.fn("EffectDbSqliteFiles.readMigrations")(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const names = (yield* fs.readDirectory(directory))
    .filter((name) => /^\d{14}_/.test(name))
    .toSorted();

  return yield* Effect.forEach(names, (tag) => {
    return fs
      .readFileString(path.join(directory, tag, "migration.sql"))
      .pipe(Effect.map((sql) => ({ tag, sql })));
  });
});

export * as EffectDbSqliteFiles from "./files";
