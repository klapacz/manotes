import { Schema } from "effect";
import { Rpc, RpcGroup } from "@effect/rpc";
import { Transferable } from "@effect/platform";

/** Initial message sent from main thread to SharedWorker. */
export const GraphSharedInitialMessageSchema = Schema.Struct({
  graphName: Schema.String,
});

export type GraphSharedInitialMessage =
  typeof GraphSharedInitialMessageSchema.Type;

export class DedicatedWorkerHealth extends Schema.Class<DedicatedWorkerHealth>(
  "DedicatedWorkerHealth",
)({
  status: Schema.Literal("healthy", "degraded", "down"),
  consecutiveFailures: Schema.Number,
  lastFailure: Schema.String,
}) {}

/** External RPC surface (main thread -> SharedWorker). */
export class GraphSharedWorkerRpc extends RpcGroup.make(
  Rpc.make("materialize", {
    success: Schema.Void,
    error: Schema.Never,
    payload: {
      noteId: Schema.String,
    },
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
) {}

/** Internal RPC surface (SharedWorker -> Dedicated Worker via MessagePort). */
export class GraphDedicatedRpc extends RpcGroup.make(
  Rpc.make("materialize", {
    payload: { noteId: Schema.String },
    success: Schema.Void,
    error: Schema.Never,
  }),
) {}

/**
 * Initial message for the dedicated worker (not RPC).
 * Carries the `MessagePort` and graph name.
 *
 * IMPORTANT: The _tag MUST be exactly "InitialMessage" — `layerSerialized`'s
 * `HandlersContext` type hardcodes this key to track Layer requirements.
 * Any other name silently drops unsatisfied dependencies from the type.
 */
export class GraphDedicatedInitialMessage extends Schema.TaggedRequest<GraphDedicatedInitialMessage>()(
  "InitialMessage",
  {
    payload: {
      port: Transferable.MessagePort,
      graphName: Schema.String,
    },
    success: Schema.Void,
    failure: Schema.Never,
  },
) {}
