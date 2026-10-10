import { DateTime, Effect, Layer, Context, Schema } from "effect";
import { nanoid } from "nanoid";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { type Graph } from "@manotes/shared/graph-registry/contract";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import * as RemoteRegistryService from "../remote-registry/service";
import * as SessionService from "../session/service";
import type * as BackupSchema from "@manotes/shared/graph-backup/schema";
import { GraphInitialize } from "../graph-runtime/initialize";

export type CreateLocalInput = {
  displayName: string;
  events?: BackupSchema.Bundle["events"];
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
      events,
    }: CreateLocalInput) {
      const createdAt = yield* DateTime.now;
      const graph = yield* LocalRegistry.Repo.insertGraph(makeLocalRecord({ displayName }));
      yield* GraphInitialize.initialize({ localGraphId: graph.localGraphId, createdAt, events });

      return graph;
    });

    const createSynced = Effect.fn("GraphAccessCommandsProvision.createSynced")(function* ({
      displayName,
      password,
    }: CreateSyncedInput) {
      const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
      const session = yield* SessionService.Service.use((svc) => svc.get);
      const client = yield* RemoteRegistryService.Service;

      const graph = yield* client("createGraph", {
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
      yield* GraphInitialize.initialize({
        localGraphId: localGraph.localGraphId,
        createdAt: yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(graph.createdAt),
      });

      return localGraph;
    });

    const openCloudOnDevice = Effect.fn("GraphAccessCommandsProvision.openCloudOnDevice")(
      function* ({ graph }: OpenCloudOnDeviceInput) {
        const session = yield* SessionService.Service.use((svc) => svc.get);

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
    Layer.provide(SessionService.Service.layer),
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
