import { Effect, Layer, Context } from "effect";
import { nanoid } from "nanoid";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { type Graph } from "@manotes/shared/graph-registry/contract";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import * as RemoteRegistryService from "../remote-registry/service";
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

export class Service extends Context.Service<Service>()("GraphAccess.Commands.Provision.Service", {
  make: Effect.gen(function* () {
    const keyStore = yield* KeyStoreService.Service;

    const createLocal = Effect.fn("GraphAccessCommandsProvision.createLocal")(function* ({
      displayName,
    }: CreateLocalInput) {
      return yield* LocalRegistry.Repo.insertGraph(makeLocalRecord({ displayName }));
    });

    const createSynced = Effect.fn("GraphAccessCommandsProvision.createSynced")(function* ({
      displayName,
      password,
    }: CreateSyncedInput) {
      const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
      const session = yield* SessionService.get();
      const client = yield* RemoteRegistryService.Service;
      const graph = yield* client.createGraph({
        displayName,
        graphKeyEnvelope: wrapped.envelope,
      });
      const localGraph = yield* createCloudGraph({
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

        return yield* createCloudGraph({
          graphId: graph.graphId,
          displayName: graph.displayName,
          graphKeyEnvelope: graph.graphKeyEnvelope,
          accountId: session.accountId,
        });
      },
    );

    return { createLocal, createSynced, openCloudOnDevice };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(KeyStoreService.Service.layer),
  );
}

const createCloudGraph = Effect.fn("GraphAccessCommandsProvision.createCloudGraph")(function* ({
  graphId,
  displayName,
  graphKeyEnvelope,
  accountId,
}: {
  graphId: string;
  displayName: string;
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelope;
  accountId: string;
}) {
  return yield* LocalRegistry.Repo.insertGraph({
    localGraphId: nanoid(LOCAL_GRAPH_ID_LENGTH),
    displayName,
    status: "active",
    mode: "cloud",
    graphId,
    accountId,
    graphKeyEnvelope,
  });
});

const makeLocalRecord = ({ displayName }: CreateLocalInput): LocalRegistry.Schema.LocalRecord => ({
  localGraphId: nanoid(LOCAL_GRAPH_ID_LENGTH),
  displayName,
  status: "active",
  mode: "local",
  graphId: null,
  accountId: null,
  graphKeyEnvelope: null,
});

const LOCAL_GRAPH_ID_LENGTH = 6;
