import { constants } from "node:fs";
import path from "node:path";
import { Context, Effect, FileSystem, Layer, Schema } from "effect";
import * as DB from "../lib/db.service";
import { CliPaths } from "./cli.paths";

export const GraphKey = Schema.RedactedFromValue(
  Schema.Uint8ArrayFromBase64.pipe(Schema.check(Schema.isLengthBetween(32, 32))),
);

export const Config = Schema.Struct({
  origin: Schema.NonEmptyString,
  token: Schema.NonEmptyString,
  graphId: Schema.NonEmptyString,
  graphKey: GraphKey,
  autoSync: Schema.optionalKey(Schema.Boolean),
});
export type Config = typeof Config.Type;

const ConfigFile = Schema.fromJsonString(Config);
const encodeConfigFile = Schema.encodeEffect(ConfigFile);
const decodeConfigFile = Schema.decodeEffect(ConfigFile);

export class Service extends Context.Service<Service, Config>()("CliConfig.Service") {}

export const layerFromFile = Layer.unwrap(
  Effect.gen(function* () {
    const paths = yield* CliPaths.Service;
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(paths.configPath);
    const config = yield* decodeConfigFile(text);

    return makeLayer(config);
  }),
);

export const makeLayer = (config: Config) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const paths = yield* CliPaths.Service;
      return Layer.mergeAll(
        Layer.succeed(Service, config),
        Layer.succeed(
          DB.Config,
          DB.Config.of({ localGraphId: config.graphId, databasePath: paths.databasePath }),
        ),
      );
    }),
  );

export const write = Effect.fn("CliConfig.write")(function* () {
  const paths = yield* CliPaths.Service;
  const config = yield* Service;
  const fs = yield* FileSystem.FileSystem;
  const encoded = yield* encodeConfigFile(config);

  yield* fs.writeFileString(paths.configPath, encoded, { mode: CONFIG_MODE, flag: "wx" });

  const zkDir = path.join(paths.dir, ".zk");
  yield* fs.makeDirectory(zkDir, { recursive: true });
  // An empty config enables zk's defaults. Append mode preserves existing settings.
  yield* fs.writeFileString(path.join(zkDir, "config.toml"), "", { flag: "a" });
});

const CONFIG_MODE = constants.S_IRUSR | constants.S_IWUSR;

export function normalizeOrigin(origin: string): string {
  return /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;
}

export * as CliConfig from "./cli.config";
