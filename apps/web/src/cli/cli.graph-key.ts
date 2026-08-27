import { Effect, Option } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";

export const fetchUnwrapped = Effect.fn("CliGraphKey.fetchUnwrapped")(function* (input: {
  readonly origin: string;
  readonly token: string;
  readonly graphId: string;
  readonly secret: string;
}) {
  const envelope = yield* fetchGraphEnvelope(input);

  return yield* Effect.tryPromise({
    try: () => GraphEncryption.unwrapGraphKey({ password: input.secret, envelope }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
});

const fetchGraphEnvelope = Effect.fn("CliGraphKey.fetchGraphEnvelope")(function* (config: {
  readonly origin: string;
  readonly token: string;
  readonly graphId: string;
}) {
  const makeClient = RpcClient.make(GraphRegistryRpc, { flatten: true });
  const graph = yield* Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient.pipe(
        Effect.provide(
          RpcClient.layerProtocolHttp({
            url: new URL("/api/rpc/graph-registry", config.origin).toString(),
            transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(config.token)),
          }),
        ),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provide(FetchHttpClient.layer),
      );

      return yield* client("getGraph", { graphId: config.graphId });
    }),
  );

  if (Option.isNone(graph)) {
    return yield* Effect.fail(new Error(`Graph not found: ${config.graphId}`));
  }

  return graph.value.graphKeyEnvelope;
});

export * as CliGraphKey from "./cli.graph-key";
