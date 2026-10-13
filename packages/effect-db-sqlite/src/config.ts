import { Schema } from "effect";

const Renames = Schema.Record(Schema.String, Schema.String);

export const Config = Schema.Struct({
  dialect: Schema.Literal("sqlite"),
  source: Schema.Struct({
    include: Schema.NonEmptyArray(Schema.NonEmptyString),
    exclude: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
  migrations: Schema.Struct({
    dir: Schema.NonEmptyString,
  }),
  renames: Schema.optionalKey(
    Schema.Struct({
      tables: Schema.optionalKey(Renames),
      columns: Schema.optionalKey(Schema.Record(Schema.String, Renames)),
    }),
  ),
});

export type Config = typeof Config.Type;

export const defineConfig = <const C extends Config>(config: C): C => config;

export const decodeConfig = Schema.decodeUnknownSync(Config);

export * as EffectDbSqliteConfig from "./config";
