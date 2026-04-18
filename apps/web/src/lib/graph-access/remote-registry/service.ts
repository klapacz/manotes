import { Layer, ServiceMap } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import * as RemoteRegistryLayer from "./layer";

export class Service extends ServiceMap.Service<Service>()("GraphAccess.RemoteRegistry.Service", {
  make: RpcClient.make(GraphRegistryRpc),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RemoteRegistryLayer.Layer),
  );
}
