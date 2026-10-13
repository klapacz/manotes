import { pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { Effect, FileSystem, Path, Schema, Scope } from "effect";
import { glob } from "tinyglobby";
import { register } from "tsx/esm/api";
import { isTableDefinition } from "effect-qb/postgres/metadata";
import {
  generate as generateKit,
  type GenerateOptions as KitOptions,
  type Hint,
} from "drizzle-kit/cli";
import { EffectDbSqliteConfig } from "./config";
import { EffectDbSqliteSchema } from "./schema";

export interface LoadedConfig {
  readonly cwd: string;
  readonly config: EffectDbSqliteConfig.Config;
}

export interface GenerateOptions {
  readonly name?: string;
  readonly dryRun?: boolean;
}

export const loadConfig = (file: string) => {
  return Effect.tryPromise(async () => ({
    cwd: dirname(file),
    config: EffectDbSqliteConfig.decodeConfig((await importModule(file)).default),
  }));
};

export const generate = Effect.fn("EffectDbSqliteGenerate.generate")(function* (
  loaded: LoadedConfig,
  options: GenerateOptions = {},
): Effect.fn.Return<
  Awaited<ReturnType<typeof generateKit>>,
  unknown,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const files = yield* Effect.tryPromise(() => {
    return glob([...loaded.config.source.include], {
      cwd: loaded.cwd,
      absolute: true,
      ignore: [...(loaded.config.source.exclude ?? [])],
    });
  });

  if (files.length === 0) return yield* Effect.fail(new Error("No schema source files matched"));
  const tables = yield* Effect.tryPromise(() => loadTables(files.toSorted()));
  const translated = yield* Effect.try(() => EffectDbSqliteSchema.toDrizzleTables(tables));

  if (translated.length === 0) return yield* Effect.fail(new Error("No QB schema tables exported"));

  const temporary = yield* fs.makeTempDirectoryScoped({
    directory: loaded.cwd,
    prefix: ".effectdb-",
  });

  const schema = path.join(temporary, "schema.mjs");
  // Kit's public SDK reads schema modules. The bridge keeps QB as the only maintained schema.
  yield* fs.writeFileString(
    schema,
    [
      `import { EffectDbSqliteGenerate, EffectDbSqliteSchema } from ${JSON.stringify(new URL("./index.mjs", import.meta.url).href)};`,
      `const tables = EffectDbSqliteSchema.toDrizzleTables(await EffectDbSqliteGenerate.loadTables(${JSON.stringify(files.toSorted())}));`,
      ...translated.map((_, i) => `export const table${i} = tables[${i}];`),
    ].join("\n"),
  );

  const hints: Hint[] = [
    ...Object.entries(loaded.config.renames?.tables ?? {}).map(([from, to]): Hint => ({
      type: "rename",
      kind: "table",
      from: ["public", from],
      to: ["public", to],
    })),
    ...Object.entries(loaded.config.renames?.columns ?? {}).flatMap(([table, columns]) => {
      return Object.entries(columns).map(([from, to]): Hint => ({
        type: "rename",
        kind: "column",
        from: ["public", table, from],
        to: ["public", table, to],
      }));
    }),
  ];

  const out = path.resolve(loaded.cwd, loaded.config.migrations.dir);

  if (!options.dryRun && (yield* fs.exists(out))) {
    const latest = (yield* fs.readDirectory(out))
      .filter((name) => /^\d{14}_/.test(name))
      .toSorted()
      .at(-1)
      ?.slice(0, 14);

    const now = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

    if (latest && latest > now) {
      return yield* Effect.fail(
        new Error("Latest migration is dated in the future; check the system clock"),
      );
    }

    // Kit uses second-precision folder names; equal timestamps can reverse dependency order.
    if (latest === now) yield* Effect.sleep("1 second");
  }

  const request: KitOptions = {
    dialect: "sqlite",
    schema,
    out,
    name: options.name,
    explain: options.dryRun,
    hints,
  };

  const result = yield* Effect.tryPromise(() => generateKit(request));

  if (result.status === "error" || result.status === "missing_hints") {
    return yield* Effect.fail(new Error(JSON.stringify(result)));
  }

  return result;
}, Effect.scoped);

export async function loadTables(files: readonly string[]) {
  const modules = [];

  for (const file of files) modules.push(await importModule(file));

  return modules.flatMap((module) => Object.values(module).filter(isTableDefinition));
}

async function importModule(file: string) {
  // Scoped tsImport duplicates Effect's private Schema sentinels; keep normal module identities.
  const unregister = register();

  try {
    return decodeModule(await import(pathToFileURL(file).href));
  } finally {
    await unregister();
  }
}

export async function configDialect(file: string): Promise<string> {
  return decodeDialect((await importModule(file)).default).dialect;
}

const decodeModule = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown));

const decodeDialect = Schema.decodeUnknownSync(Schema.Struct({ dialect: Schema.String }));

export * as EffectDbSqliteGenerate from "./generate";
