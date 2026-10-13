import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { NodeServices } from "@effect/platform-node";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Command, Flag } from "effect/cli";
import { Console, Effect, Option, Path } from "effect";
import { EffectDbSqliteFiles } from "./files";
import { EffectDbSqliteGenerate } from "./generate";
import { EffectDbSqliteMigrate } from "./migrate";

/** SQLite dispatch for the effect-db CLI; other dialects use the upstream CLI. */
export async function runIfSqlite(args: readonly string[]): Promise<boolean> {
  const configIndex = args.findIndex(
    (argument) => argument === "--config" || argument === "-c" || argument.startsWith("--config="),
  );

  const file = resolve(
    configIndex < 0
      ? "effectdb.config.ts"
      : args[configIndex]?.startsWith("--config=")
        ? args[configIndex].slice("--config=".length)
        : (args[configIndex + 1] ?? "effectdb.config.ts"),
  );

  if (!existsSync(file)) return false;

  if ((await EffectDbSqliteGenerate.configDialect(file)) !== "sqlite") return false;
  const loaded = await Effect.runPromise(EffectDbSqliteGenerate.loadConfig(file));
  const config = Flag.String("config").pipe(Flag.withAlias("c"), Flag.optional);

  const generateCommand = Command.make(
    "generate",
    {
      config,
      name: Flag.String("name").pipe(Flag.optional),
      dryRun: Flag.Boolean("dry-run").pipe(Flag.withDefault(false)),
    },
    (options) => {
      return EffectDbSqliteGenerate.generate(loaded, {
        name: Option.getOrUndefined(options.name),
        dryRun: options.dryRun,
      }).pipe(
        Effect.flatMap((result) => {
          return Console.log(
            result.status === "no_changes"
              ? "No schema changes."
              : "migration_path" in result
                ? result.migration_path
                : JSON.stringify(result),
          );
        }),
      );
    },
  );

  const up = Command.make("up", { config, database: Flag.String("database") }, ({ database }) => {
    return Effect.gen(function* () {
      const path = yield* Path.Path;
      const directory = path.resolve(loaded.cwd, loaded.config.migrations.dir);
      const migrations = yield* EffectDbSqliteFiles.readMigrations(directory);

      yield* EffectDbSqliteMigrate.migrate(migrations).pipe(
        Effect.provide(SqliteClient.layer({ filename: resolve(database) })),
      );
      yield* Console.log("SQLite migrations applied.");
    });
  });

  const root = Command.make("effectdb").pipe(
    Command.withSubcommands([
      Command.make("migrate").pipe(Command.withSubcommands([generateCommand, up])),
    ]),
  );

  await Effect.runPromise(
    Command.runWith(root, { version: "0.24.1-sqlite" })(args).pipe(
      Effect.provide(NodeServices.layer),
    ),
  );

  return true;
}

export * as EffectDbSqliteCli from "./cli";
