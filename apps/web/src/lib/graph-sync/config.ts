import { Schema, ServiceMap } from "effect";

export const GraphSyncConfigSchema = Schema.Union([
  Schema.Struct({
    mode: Schema.Literals(["local"]),
  }),
  Schema.Struct({
    mode: Schema.Literals(["cloud"]),
    graphId: Schema.NonEmptyString,
    graphKey: Schema.Uint8Array,
  }),
]);

export type GraphSyncConfig = Schema.Schema.Type<typeof GraphSyncConfigSchema>;

export class Config extends ServiceMap.Service<Config, GraphSyncConfig>()("GraphSync.Config") {}
