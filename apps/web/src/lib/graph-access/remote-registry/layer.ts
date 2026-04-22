import { Layer, Effect } from "effect";
import { HttpClient, FetchHttpClient } from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as SessionService from "../session/service";
import * as SessionAtom from "../session/atom";
import type { Atom } from "effect/unstable/reactivity";

export const layer = Effect.gen(function* () {
  const sessionService = yield* SessionService.Service;

  const layer = makeLayer(sessionService.refresh);
  return layer;
})
  .pipe(Layer.unwrap)
  .pipe(Layer.provide(SessionService.Service.layer));

export function makeAtomLayer(get: Atom.AtomContext) {
  return makeLayer(Effect.sync(() => get.refresh(SessionAtom.get)));
}

function makeLayer(refresh: Effect.Effect<void, never, never>) {
  const httpClientRefreshOnUnauthorized = Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient.asEffect();

      return client.pipe(
        HttpClient.tap(
          Effect.fnUntraced(function* (response) {
            if (response.status === 401) yield* refresh;
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

  return RpcClient.layerProtocolHttp({
    url: "/api/rpc/graph-registry",
  }).pipe(
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(httpClientRefreshOnUnauthorized),
  );
}
