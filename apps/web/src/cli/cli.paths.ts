import path from "node:path";
import { Context, Effect, Layer, Option, FileSystem } from "effect";
import { Flag, GlobalFlag } from "effect/unstable/cli";

export const MANOTES_DIR = ".manotes";

export const CONFIG_FILE = "config";

export const DATABASE_FILE = "db.sqlite";

export type Paths = {
  readonly dir: string;
  readonly manotesDir: string;
  readonly configPath: string;
  readonly databasePath: string;
};

export class Service extends Context.Service<Service, Paths>()("CliPaths.Service") {}

export const DirFlag = GlobalFlag.setting("dir")({
  flag: Flag.string("dir").pipe(
    Flag.optional,
    Flag.withDescription(
      "Materialized notes directory (defaults to the current working directory).",
    ),
  ),
});

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const dirOption = yield* DirFlag;
    const cwd = process.cwd();
    const dir = Option.getOrElse(dirOption, () => cwd);
    const resolvedDir = path.isAbsolute(dir) ? dir : path.resolve(cwd, dir);
    const manotesDir = path.join(resolvedDir, MANOTES_DIR);

    return {
      dir: resolvedDir,
      manotesDir,
      configPath: path.join(manotesDir, CONFIG_FILE),
      databasePath: path.join(manotesDir, DATABASE_FILE),
    };
  }),
);

export const ensureEmpty = Effect.fn("CliPaths.ensureEmpty")(function* () {
  const paths = yield* Service;
  const fs = yield* FileSystem.FileSystem;

  const exists = yield* fs.exists(paths.dir);

  if (!exists) return;

  const entries = yield* fs.readDirectory(paths.dir);

  if (entries.length > 0) {
    return yield* Effect.fail(
      new Error(
        `Cannot initialize in non-empty directory: ${paths.dir}. Choose an empty directory.`,
      ),
    );
  }
});

export const mkdir = Effect.fn("CliPaths.mkdir")(function* () {
  const workspacePaths = yield* Service;
  const fs = yield* FileSystem.FileSystem;

  yield* fs.makeDirectory(workspacePaths.dir, { recursive: true });
  yield* fs.makeDirectory(workspacePaths.manotesDir);
});

export * as CliPaths from "./cli.paths.ts";
