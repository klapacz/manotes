import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { Transferable } from "effect/unstable/workers";
import * as GraphSyncConfig from "./graph-sync/config";

/** Initial message sent from main thread to SharedWorker. */
export const GraphSharedInitialMessageSchema = Schema.Struct({
  localGraphId: Schema.String,
  graphSyncMode: Schema.Literals(["local", "cloud"]),
});

export type GraphSharedInitialMessage = typeof GraphSharedInitialMessageSchema.Type;

export class SyncStatusLocal extends Schema.Class<SyncStatusLocal>("SyncStatusLocal")({
  mode: Schema.Literals(["local"]),
}) {}

export class SyncStatusCloud extends Schema.Class<SyncStatusCloud>("SyncStatusCloud")({
  mode: Schema.Literals(["cloud"]),
  syncState: Schema.Literals(["Disconnected", "Bootstrapping", "Ready", "Committing"]),
  hasPending: Schema.Boolean,
}) {}

export const SyncStatus = Schema.Union([SyncStatusLocal, SyncStatusCloud]);
export type SyncStatus = typeof SyncStatus.Type;

export class DedicatedWorkerHealth extends Schema.Class<DedicatedWorkerHealth>(
  "DedicatedWorkerHealth",
)({
  status: Schema.Literals(["healthy", "degraded", "down"]),
  consecutiveFailures: Schema.Number,
  lastFailure: Schema.String,
}) {}

/** External RPC surface (main thread -> SharedWorker). */
export class GraphSharedWorkerRpc extends RpcGroup.make(
  Rpc.make("placeholder", {
    success: Schema.Void,
    error: Schema.Never,
    payload: {},
  }),
  Rpc.make("updateMessagePort", {
    payload: {
      port: Transferable.MessagePort,
    },
    success: Schema.Void,
    error: Schema.Never,
  }),
  Rpc.make("healthStream", {
    payload: {},
    success: DedicatedWorkerHealth,
    error: Schema.Never,
    stream: true,
  }),
  Rpc.make("syncStatusStream", {
    payload: {},
    success: SyncStatus,
    error: Schema.Never,
    stream: true,
  }),
) {}

/** Internal RPC surface (SharedWorker -> Dedicated Worker via MessagePort). */
export class GraphDedicatedRpc extends RpcGroup.make(
  Rpc.make("placeholder", {
    payload: {},
    success: Schema.Void,
    error: Schema.Never,
  }),
  Rpc.make("syncStatusStream", {
    payload: {},
    success: SyncStatus,
    error: Schema.Never,
    stream: true,
  }),
) {}

/** Initial message for the dedicated worker (not RPC). */
export class GraphDedicatedInitialMessage extends Schema.Class<GraphDedicatedInitialMessage>(
  "GraphDedicatedInitialMessage",
)({
  port: Transferable.MessagePort,
  localGraphId: Schema.String,
  graphSyncConfig: GraphSyncConfig.GraphSyncConfigSchema,
}) {}
