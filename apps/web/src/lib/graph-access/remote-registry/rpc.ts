import { FetchHttpClient } from "effect/unstable/http";
import { Layer as EffectLayer } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Graph } from "@manotes/shared/graph-registry/contract";

export { Graph };

export const Layer = RpcClient.layerProtocolHttp({
  url: "/api/rpc/graph-registry",
}).pipe(
  EffectLayer.provide(RpcSerialization.layerJson),
  EffectLayer.provide(FetchHttpClient.layer),
);
