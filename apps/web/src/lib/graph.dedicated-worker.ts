import { BrowserRuntime, BrowserWorkerRunner } from "@effect/platform-browser";
import * as Socket from "effect/unstable/socket/Socket";
import { Effect, Layer, References, Stream, SubscriptionRef } from "effect";
import { RpcGroup, RpcServer, RpcWorker } from "effect/unstable/rpc";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as MaterializedEventService from "./materialized-event.service";
import * as BacklinkService from "./materializer/backlink/service";
import * as MaterializerService from "./materializer.service";
import * as NoteRepo from "./note.repo";
import * as GraphSync from "./graph-sync/service";
import * as GraphSyncContext from "./graph-sync/context";
import * as GraphSyncEncryption from "./graph-sync/encryption/service";
import * as GraphSyncEventLog from "./graph-sync/event-log.service";
import {
  GraphDedicatedRpc,
  GraphDedicatedInitialMessage,
  SyncStatusCloud,
  SyncStatusLocal,
} from "./graph.worker-rpc";
import * as GraphSyncStatus from "./graph-sync/status";
import { SqlLive } from "./db.service";
import * as GraphSyncConfig from "./graph-sync/config";

const bootstrapEffect = Effect.gen(function* () {
  // Build the bootstrap layers (WorkerRunner on `self`) using the Layer.unwrap
  // build scope. This prevents the scope from closing after receiving the initial
  // message — in v4, BrowserWorkerRunner cleanup calls self.close() which would
  // terminate the worker.
  const bootstrapServices = yield* Layer.buildWithScope(
    RpcServer.layerProtocolWorkerRunner.pipe(Layer.provide(BrowserWorkerRunner.layer)),
    yield* Effect.scope,
  );

  const { port, localGraphId, graphSyncConfig } = yield* RpcWorker.initialMessage(
    GraphDedicatedInitialMessage,
  ).pipe(Effect.provideServices(bootstrapServices));

  yield* Effect.annotateLogsScoped({ worker: "dedicated", localGraphId });
  yield* Effect.logInfo("Received port");

  // Build the service layer for the RPC server
  const serviceLayer = buildServiceLayer({
    localGraphId,
    graphSyncConfig,
  });

  // Return a layer so WorkerRunner keeps it alive in its internal scope.
  // Layer.fresh forces a new MemoMap so that RpcServer.layerProtocolWorkerRunner
  // is built fresh here (backed by the MessagePort) rather than reusing the
  // memoized bootstrap instance (backed by `self`).
  return Layer.fresh(
    RpcServer.layer(GraphDedicatedRpc).pipe(
      Layer.provide(makeRpcHandler(localGraphId, graphSyncConfig)),
      Layer.provide(RpcServer.layerProtocolWorkerRunner),
      // Listen on the transferred MessagePort instead of self.
      Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
      Layer.provide(serviceLayer),
      Layer.orDie,
    ),
  );
});

// Bootstrap runner - receives MessagePort via initial message and installs
// the RPC server layer into the serialized runner context.
const BootstrapRunner = Layer.unwrap(bootstrapEffect);

BrowserRuntime.runMain(
  Effect.scoped(Layer.launch(BootstrapRunner)).pipe(
    Effect.tapCause((error) => {
      return Effect.logError("Dedicated worker fatal error", error);
    }),
  ),
);

type Handlers = RpcGroup.HandlersFrom<RpcGroup.Rpcs<typeof GraphDedicatedRpc>>;

/** RPC handler layer with graph-scoped materialization logic. */
function makeRpcHandler(localGraphId: string, graphSyncConfig: GraphSyncConfig.GraphSyncConfig) {
  return GraphDedicatedRpc.toLayer(
    Effect.gen(function* () {
      yield* Effect.logInfo("RPC handler started");

      const materializer = yield* MaterializerService.Service;

      yield* materializer.start().pipe(
        Effect.catchCause((cause) => Effect.logError("Materializer failed", cause)),
        Effect.forkScoped,
      );

      if (graphSyncConfig.mode === "cloud") {
        const syncStatusRef = yield* SubscriptionRef.make(
          new SyncStatusCloud({
            mode: "cloud",
            syncState: "Disconnected",
            hasPending: false,
          }),
        );

        const graphSyncLayer = Layer.mergeAll(
          GraphSyncEncryption.Service.layer,
          GraphSyncEventLog.Service.layer,
          GraphSync.Service.layer,
        ).pipe(
          Layer.provideMerge(
            Layer.merge(
              Layer.succeed(
                GraphSyncContext.Context,
                GraphSyncContext.Context.of({
                  graphId: graphSyncConfig.graphId,
                  graphKey: graphSyncConfig.graphKey,
                }),
              ),
              Layer.succeed(GraphSyncStatus.Ref, syncStatusRef),
            ),
          ),
        );

        yield* Effect.gen(function* () {
          const graphSync = yield* GraphSync.Service;

          yield* graphSync.start().pipe(
            Effect.catchCause((cause) => Effect.logError("Graph sync failed", cause)),
            Effect.forkScoped,
          );
        }).pipe(Effect.provide(graphSyncLayer));

        return {
          placeholder: Effect.fn("DedicatedWorker.placeholder")(function* () {
            yield* Effect.logInfo("Placeholder RPC invoked");
          }),
          syncStatusStream: () => SubscriptionRef.changes(syncStatusRef),
        } satisfies Handlers;
      }

      return {
        placeholder: Effect.fn("DedicatedWorker.placeholder")(function* () {
          yield* Effect.logInfo("Placeholder RPC invoked");
        }),
        syncStatusStream: () =>
          Stream.make(new SyncStatusLocal({ mode: "local" })).pipe(Stream.concat(Stream.never)),
      } satisfies Handlers;
    }).pipe(Effect.annotateLogs({ worker: "dedicated", localGraphId })),
  );
}

// TODO: reuse services building between dedicated workers and main thread
/** Builds the service layer for a specific graph. */
function buildServiceLayer(opts: {
  localGraphId: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
}) {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      databasePath: `${opts.localGraphId}.sqlite3`,
    }),
  );
  const DBWithConfigLayer = Layer.provideMerge(SqlLive, ConfigLayer);
  const GraphSyncConfigLayer = Layer.succeed(
    GraphSyncConfig.Config,
    GraphSyncConfig.Config.of(opts.graphSyncConfig),
  );
  return Layer.mergeAll(
    DB.Service.layer,
    EventRepo.Service.layer,
    NoteRepo.Service.layer,
    BacklinkService.Service.layer,
    MaterializationCheckpointRepo.Service.layer,
    MaterializedEventService.Service.layer,
    MaterializerService.Service.layer,
    Socket.layerWebSocketConstructorGlobal,
    Layer.succeed(References.MinimumLogLevel, "Debug"),
  ).pipe(
    // Keep DB.Config in the final layer output because downstream effects
    // still read it directly even after the service graph has been built.
    Layer.provide(GraphSyncConfigLayer),
    Layer.provideMerge(DBWithConfigLayer),
  );
}
