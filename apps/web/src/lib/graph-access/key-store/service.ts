import { Effect, HashMap, Layer, Schema, Context, Stream, SubscriptionRef, Option } from "effect";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { SqlClient } from "effect/unstable/sql";
import * as LocalRegistry from "../local-registry";
import * as LocalRegistryLayer from "../local-registry/layer";

type GraphKeyId = string;

type UnwrappedGraphKey = Uint8Array<ArrayBuffer>;

const encodeWrappedGraphKey = Schema.encodeEffect(Schema.Uint8ArrayFromBase64);

const toGraphKeyId = (envelope: GraphEncryption.GraphKeyEnvelope) =>
  encodeWrappedGraphKey(envelope.wrappedGraphKey);

export class Service extends Context.Service<Service>()("GraphAccess.KeyStore.Service", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const ref = yield* SubscriptionRef.make<HashMap.HashMap<GraphKeyId, UnwrappedGraphKey>>(
      HashMap.empty(),
    );

    const set = Effect.fn("GraphAccessKeyStore.set")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
      graphKey: UnwrappedGraphKey,
    ) {
      const key = yield* toGraphKeyId(envelope);
      yield* SubscriptionRef.update(ref, HashMap.set(key, graphKey));
    });

    const get = Effect.fn("GraphAccessKeyStore.get")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
    ) {
      const key = yield* toGraphKeyId(envelope);
      const map = yield* SubscriptionRef.get(ref);

      const memoryKey = HashMap.get(map, key);

      if (Option.isSome(memoryKey)) return memoryKey;

      return yield* LocalRegistry.Repo.findRememberedKey({ envelope }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.map(
          Option.map(({ rememberedGraphKey }) => GraphEncryption.castArray(rememberedGraphKey)),
        ),
      );
    });

    const remember = Effect.fn("GraphAccessKeyStore.remember")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
      graphKey: UnwrappedGraphKey,
    ) {
      yield* LocalRegistry.Repo.saveRememberedKey({ envelope, graphKey }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
      );
    });

    const remove = Effect.fn("GraphAccessKeyStore.remove")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
    ) {
      const key = yield* toGraphKeyId(envelope);
      yield* LocalRegistry.Repo.forgetRememberedKey({ envelope }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
      );
      yield* SubscriptionRef.update(ref, HashMap.remove(key));
    });

    const changes = Effect.fn("GraphAccessKeyStore.changes")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
    ) {
      const key = yield* toGraphKeyId(envelope);

      const memory = SubscriptionRef.changes(ref).pipe(Stream.map((map) => HashMap.get(map, key)));

      const saved = LocalRegistry.Repo.findRememberedKeyReactive({ envelope }).pipe(
        Stream.provideService(SqlClient.SqlClient, sql),
        Stream.map(
          Option.map(({ rememberedGraphKey }) => GraphEncryption.castArray(rememberedGraphKey)),
        ),
      );

      return Stream.zipLatest(memory, saved).pipe(
        Stream.map(([memoryKey, savedKey]) => Option.orElse(memoryKey, () => savedKey)),
        Stream.changes,
      );
    });

    return {
      set,
      get,
      remove,
      remember,
      changes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(LocalRegistryLayer.Layer),
  );
}
