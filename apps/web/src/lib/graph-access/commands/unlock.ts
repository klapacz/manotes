import { Effect, Layer, ServiceMap } from "effect";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";

export type UnlockCloudGraphInput = {
  graph: LocalRegistry.Schema.CloudRecord;
  password: string;
};

export class Service extends ServiceMap.Service<Service>()("GraphAccess.Commands.Unlock.Service", {
  make: Effect.gen(function* () {
    const keyStore = yield* KeyStoreService.Service;

    const unlockCloudGraph = Effect.fn("GraphAccessCommandsUnlock.unlockCloudGraph")(function* ({
      graph,
      password,
    }: UnlockCloudGraphInput) {
      const graphKey = yield* Effect.tryPromise({
        try: () =>
          GraphEncryption.unwrapGraphKey({
            password,
            envelope: graph.graphKeyEnvelope,
          }),
        catch: (cause) =>
          cause instanceof GraphEncryption.InvalidPasswordError
            ? cause
            : cause instanceof Error
              ? cause
              : new Error("Failed to unlock graph."),
      });

      yield* keyStore.set(graph.graphKeyEnvelope, graphKey);

      return {
        localGraphId: graph.localGraphId,
      };
    });

    return { unlockCloudGraph };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(KeyStoreService.Service.layer),
  );
}
