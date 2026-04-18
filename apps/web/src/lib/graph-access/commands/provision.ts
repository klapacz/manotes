import { Effect, Layer, ServiceMap } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { GraphRegistryRpc, type Graph } from "@manotes/shared/graph-registry/contract";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import * as SessionService from "../session/service";

export type CreateLocalInput = {
  displayName: string;
};

export type CreateSyncedInput = {
  displayName: string;
  password: string;
};

export type OpenCloudOnDeviceInput = {
  graph: Graph;
};

export class Service extends ServiceMap.Service<Service>()(
  "GraphAccess.Commands.Provision.Service",
  {
    make: Effect.gen(function* () {
      const keyStore = yield* KeyStoreService.Service;

      const createLocal = Effect.fn("GraphAccessCommandsProvision.createLocal")(function* ({
        displayName,
      }: CreateLocalInput) {
        return yield* LocalRegistry.Repo.createGraph(displayName);
      });

      const createSynced = Effect.fn("GraphAccessCommandsProvision.createSynced")(function* ({
        displayName,
        password,
      }: CreateSyncedInput) {
        const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
        const session = yield* SessionService.get();
        const client = yield* RpcClient.make(GraphRegistryRpc);
        const graph = yield* client.createGraph({
          displayName,
          graphKeyEnvelope: wrapped.envelope,
        });
        const localGraph = yield* LocalRegistry.Repo.createCloudGraph({
          graphId: graph.graphId,
          displayName: graph.displayName,
          graphKeyEnvelope: graph.graphKeyEnvelope,
          accountId: session.accountId,
        });

        yield* keyStore.set(wrapped.envelope, wrapped.graphKey);

        return localGraph;
      });

      const openCloudOnDevice = Effect.fn("GraphAccessCommandsProvision.openCloudOnDevice")(
        function* ({ graph }: OpenCloudOnDeviceInput) {
          const session = yield* SessionService.get();

          return yield* LocalRegistry.Repo.createCloudGraph({
            graphId: graph.graphId,
            displayName: graph.displayName,
            graphKeyEnvelope: graph.graphKeyEnvelope,
            accountId: session.accountId,
          });
        },
      );

      return { createLocal, createSynced, openCloudOnDevice };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(KeyStoreService.Service.layer),
  );
}
