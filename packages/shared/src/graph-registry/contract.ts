import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import * as GraphEncryption from "../graph-encryption";

export const DisplayNameSchema = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()));

export class DisplayNameTakenError extends Schema.TaggedError<DisplayNameTakenError>()(
  "GraphRegistry.DisplayNameTakenError",
  { displayName: Schema.String },
) {}

export const Graph = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelopeSchema,
});

export type Graph = typeof Graph.Type;

export class GraphRegistryRpc extends RpcGroup.make(
  Rpc.make("listGraphs", {
    success: Schema.Array(Graph),
  }),
  Rpc.make("createGraph", {
    payload: {
      displayName: DisplayNameSchema,
      graphKeyEnvelope: GraphEncryption.GraphKeyEnvelopeSchema,
    },
    success: Graph,
    error: DisplayNameTakenError,
  }),
  Rpc.make("getGraph", {
    payload: { graphId: Schema.NonEmptyString },
    success: Schema.Option(Graph),
  }),
  Rpc.make("renameGraph", {
    payload: {
      graphId: Schema.NonEmptyString,
      displayName: DisplayNameSchema,
    },
    success: Schema.Option(Graph),
    error: DisplayNameTakenError,
  }),
) {}
