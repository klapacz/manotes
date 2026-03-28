import { FetchHttpClient } from "effect/unstable/http";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Graph, GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import type { GraphKeyEnvelope } from "@manotes/shared/graph-encryption";

export { Graph };

export class DisplayNameTakenError extends Error {
  constructor() {
    super("A graph with that name already exists.");
  }
}

// ---------------------------------------------------------------------------
// RPC client setup
// ---------------------------------------------------------------------------

const GraphRegistryClientLayer = RpcClient.layerProtocolHttp({
  url: "/api/rpc/graph-registry",
}).pipe(Layer.provide(RpcSerialization.layerJson), Layer.provide(FetchHttpClient.layer));

const runtime = ManagedRuntime.make(GraphRegistryClientLayer);

// ---------------------------------------------------------------------------
// Public API — returns Promises for TanStack Query compatibility
// ---------------------------------------------------------------------------

export async function listGraphs(): Promise<ReadonlyArray<Graph>> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(GraphRegistryRpc);
      return yield* client.listGraphs();
    }).pipe(Effect.scoped),
  );
}

export async function createGraph({
  displayName,
  graphKeyEnvelope,
}: {
  displayName: string;
  graphKeyEnvelope: GraphKeyEnvelope;
}): Promise<Graph> {
  const exit = await runtime.runPromiseExit(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(GraphRegistryRpc);
      return yield* client.createGraph({ displayName, graphKeyEnvelope });
    }).pipe(Effect.scoped),
  );

  if (Exit.isSuccess(exit)) return exit.value;

  const failure = Cause.findErrorOption(exit.cause);
  if (
    Option.isSome(failure) &&
    "_tag" in failure.value &&
    failure.value._tag === "GraphRegistry.DisplayNameTakenError"
  ) {
    throw new DisplayNameTakenError();
  }

  console.error("Error creating graph:", failure);

  throw new Error(`Failed to create graph`);
}
