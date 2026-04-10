import { Layer as EffectLayer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";

export const Layer = RpcClient.layerProtocolHttp({
  url: "/api/rpc/graph-registry",
}).pipe(
  EffectLayer.provide(RpcSerialization.layerJson),
  EffectLayer.provide(FetchHttpClient.layer),
);
