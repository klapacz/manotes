import * as Context from "effect/Context";
import { Schema } from "effect";

export const GraphSyncConfigSchema = Schema.Union(
  Schema.Struct({
    mode: Schema.Literal("local"),
  }),
  Schema.Struct({
    mode: Schema.Literal("cloud"),
    graphId: Schema.NonEmptyString,
    graphKey: Schema.Uint8ArrayFromSelf,
  }),
);

export type GraphSyncConfig = Schema.Schema.Type<typeof GraphSyncConfigSchema>;

export class Config extends Context.Tag("GraphSync.Config")<
  Config,
  GraphSyncConfig
>() {}
