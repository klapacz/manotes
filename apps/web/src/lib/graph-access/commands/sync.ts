import { Effect, Layer, Option, ServiceMap } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import * as GraphAccessErrors from "../errors";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import * as SessionService from "../session/service";

export type UploadInput = {
  password: string;
  localGraphId: string;
};

export type DetachInput = {
  localGraphId: string;
};

export class Service extends ServiceMap.Service<Service>()("GraphAccess.Commands.Sync.Service", {
  make: Effect.gen(function* () {
    const keyStore = yield* KeyStoreService.Service;

    const upload = Effect.fn("GraphAccessCommandsSync.upload")(function* ({
      localGraphId,
      password,
    }: UploadInput) {
      const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
      const session = yield* SessionService.get();
      const client = yield* RpcClient.make(GraphRegistryRpc);
      const originalLocalGraph = yield* LocalRegistry.Repo.getGraph(localGraphId);

      if (Option.isNone(originalLocalGraph)) {
        return yield* Effect.fail(new GraphAccessErrors.LocalGraphNotFoundError({ localGraphId }));
      }
      if (originalLocalGraph.value.mode === "cloud") {
        return yield* Effect.fail(
          new GraphAccessErrors.LocalGraphAlreadySyncedError({
            localGraphId: originalLocalGraph.value.localGraphId,
          }),
        );
      }

      // TODO: This creates the remote graph before the local registry/key-store update.
      // If a later step fails, we orphan the remote graph and retries hit display-name taken.
      const graph = yield* client.createGraph({
        displayName: originalLocalGraph.value.displayName,
        graphKeyEnvelope: wrapped.envelope,
      });

      // Store the unwrapped key before flipping the local record to `mode: "cloud"`.
      // That keeps reactive resolution on the opened graph from going through a transient
      // `CloudLocked` state during upload, which would otherwise dispose the runtime and
      // redirect the current tab to `/unlock`.
      yield* keyStore.set(graph.graphKeyEnvelope, wrapped.graphKey);

      return yield* LocalRegistry.Repo.updateGraph({
        localGraphId: originalLocalGraph.value.localGraphId,
        accountId: session.accountId,
        mode: "cloud",
        status: "active",
        graphId: graph.graphId,
        displayName: graph.displayName,
        graphKeyEnvelope: graph.graphKeyEnvelope,
      }).pipe(
        Effect.catchCause((cause) => {
          // Remove the key from the store on error.
          const remove = keyStore.remove(graph.graphKeyEnvelope).pipe(Effect.ignore);
          return Effect.andThen(remove, Effect.failCause(cause));
        }),
      );
    });

    const detach = Effect.fn("GraphAccessCommandsSync.detach")(function* ({
      localGraphId,
    }: DetachInput) {
      const originalGraph = yield* LocalRegistry.Repo.getGraph(localGraphId);

      if (Option.isNone(originalGraph)) {
        return yield* Effect.fail(new GraphAccessErrors.LocalGraphNotFoundError({ localGraphId }));
      }
      if (originalGraph.value.mode === "local") {
        return originalGraph.value;
      }

      // Flip the record back to local before removing the key from the store.
      // That keeps reactive resolution from observing a transient `CloudLocked`
      // state during detach, which would otherwise dispose the runtime and
      // redirect the current tab to `/unlock`.
      const detached = yield* LocalRegistry.Repo.updateGraph({
        localGraphId: originalGraph.value.localGraphId,
        displayName: originalGraph.value.displayName,
        status: "active",
        mode: "local",
        graphId: null,
        accountId: null,
        graphKeyEnvelope: null,
      });

      // Best-effort cleanup. Once the row is local, resolution no longer depends
      // on the cloud key, so failure here should not roll back the detach.
      yield* keyStore.remove(originalGraph.value.graphKeyEnvelope).pipe(Effect.ignore);

      return detached;
    });

    return { upload, detach };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(KeyStoreService.Service.layer),
  );
}
