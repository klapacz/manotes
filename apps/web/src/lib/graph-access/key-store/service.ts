import { Effect, HashMap, Layer, Schema, Context, Stream, SubscriptionRef } from "effect";
import * as GraphEncryption from "@manotes/shared/graph-encryption";

type GraphKeyId = string;

type UnwrappedGraphKey = Uint8Array<ArrayBuffer>;

const encodeWrappedGraphKey = Schema.encodeEffect(Schema.Uint8ArrayFromBase64);

const toGraphKeyId = (envelope: GraphEncryption.GraphKeyEnvelope) =>
  encodeWrappedGraphKey(envelope.wrappedGraphKey);

export class Service extends Context.Service<Service>()("GraphAccess.KeyStore.Service", {
  make: Effect.gen(function* () {
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

      return HashMap.get(map, key);
    });

    const remove = Effect.fn("GraphAccessKeyStore.remove")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
    ) {
      const key = yield* toGraphKeyId(envelope);
      yield* SubscriptionRef.update(ref, HashMap.remove(key));
    });

    const changes = Effect.fn("GraphAccessKeyStore.changes")(function* (
      envelope: GraphEncryption.GraphKeyEnvelope,
    ) {
      const key = yield* toGraphKeyId(envelope);

      return SubscriptionRef.changes(ref).pipe(
        Stream.map((map) => HashMap.get(map, key)),
        // This compares Some(Uint8Array) by identity, not byte contents.
        // That's acceptable for now because writes are expected to be rare.
        Stream.changes,
      );
    });

    return {
      set,
      get,
      remove,
      changes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
