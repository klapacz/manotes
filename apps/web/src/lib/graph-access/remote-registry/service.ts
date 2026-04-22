import { Layer } from "effect";
import { AtomRpc } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import * as RemoteRegistryLayer from "./layer";

const makeClient = RpcClient.make(GraphRegistryRpc, { flatten: true });

export const listGraphsReactivityKeys = ["listGraphs"] as const;

export class Service extends AtomRpc.Service()("GraphAccess.RemoteRegistry.Service", {
  group: GraphRegistryRpc,
  protocol: RemoteRegistryLayer.makeAtomLayer,
  makeEffect: makeClient,
}) {
  static readonly layer = Layer.effect(this, makeClient).pipe(
    Layer.provide(RemoteRegistryLayer.layer),
  );

  static readonly listGraphs = this.query("listGraphs", undefined, {
    reactivityKeys: listGraphsReactivityKeys,
  });
}
