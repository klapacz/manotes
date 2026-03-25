import { BrowserRuntime, BrowserWorkerRunner } from "@effect/platform-browser";
import { WorkerRunner } from "@effect/platform";
import * as Socket from "@effect/platform/Socket";
import { Effect, Layer, Logger, LogLevel } from "effect";
import { RpcServer } from "@effect/rpc";
import type { RpcGroup } from "@effect/rpc";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as MaterializedEventService from "./materialized-event.service";
import * as BacklinkService from "./materializer/backlink/service";
import * as MaterializerService from "./materializer.service";
import * as NoteRepo from "./note.repo";
import * as GraphSync from "./graph-sync/service";
import * as GraphSyncContext from "./graph-sync/context";
import * as GraphSyncEventLog from "./graph-sync/event-log.service";
import {
  GraphDedicatedRpc,
  GraphDedicatedInitialMessage,
} from "./graph.worker-rpc";
import { SqlLive } from "./db.service";
import * as GraphSyncConfig from "./graph-sync/config";

// Bootstrap runner - receives MessagePort via initial message and installs
// the RPC server layer into the serialized runner context.
const BootstrapRunner = WorkerRunner.layerSerialized(
  GraphDedicatedInitialMessage,
  {
    // Key must match the _tag "InitialMessage" exactly — see GraphDedicatedInitialMessage.
    // This explicit `Layer.Layer<never, never, never>` contract is intentional.
    // Do NOT remove it. If this stops type-checking, close the returned layer
    // properly instead of weakening the signature.
    InitialMessage: ({
      port,
      localGraphId,
      displayName,
      graphSyncConfig,
    }): Layer.Layer<never, never, never> =>
      Layer.unwrapEffect(
        Effect.gen(function* () {
          yield* Effect.logInfo(`Received port`);

          // Build the service layer for the RPC server
          const serviceLayer = buildServiceLayer({
            localGraphId,
            displayName,
            graphSyncConfig,
          });

          // Return a layer so WorkerRunner keeps it alive in its internal scope.
          return RpcServer.layer(GraphDedicatedRpc).pipe(
            Layer.provide(makeRpcHandler(localGraphId, graphSyncConfig)),
            Layer.provide(RpcServer.layerProtocolWorkerRunner),
            // Listen on the transferred MessagePort instead of self.
            Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
            Layer.provide(serviceLayer),
            Layer.orDie,
          );
        }).pipe(Effect.annotateLogs({ worker: "dedicated", localGraphId })),
      ),
  },
);

// Launch the bootstrap runner
const RpcWorkerServer = BootstrapRunner.pipe(
  Layer.provide(BrowserWorkerRunner.layer),
);

BrowserRuntime.runMain(
  WorkerRunner.launch(RpcWorkerServer).pipe(
    Effect.provideService(
      Socket.WebSocketConstructor,
      (url, protocols) => new WebSocket(url, protocols),
    ),
    Effect.tapErrorCause((error) =>
      Effect.logError("Dedicated worker fatal error", error),
    ),
  ),
);

type Handlers = RpcGroup.HandlersFrom<RpcGroup.Rpcs<typeof GraphDedicatedRpc>>;

/** RPC handler layer with graph-scoped materialization logic. */
function makeRpcHandler(
  localGraphId: string,
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig,
) {
  return GraphDedicatedRpc.toLayer(
    Effect.gen(function* () {
      yield* Effect.logInfo("RPC handler started");

      const materializer = yield* MaterializerService.Service;

      yield* materializer.start().pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("Materializer failed", cause),
        ),
        Effect.forkScoped,
      );

      if (graphSyncConfig.mode === "cloud") {
        yield* Effect.gen(function* () {
          const graphSync = yield* GraphSync.Service;

          yield* graphSync.start().pipe(
            Effect.catchAllCause((cause) =>
              Effect.logError("Graph sync failed", cause),
            ),
            Effect.forkScoped,
          );
        }).pipe(
          Effect.provide(GraphSyncEventLog.Service.Default),
          Effect.provide(GraphSync.Service.Default),
          Effect.provideService(
            GraphSyncContext.Context,
            GraphSyncContext.Context.of({ graphId: graphSyncConfig.graphId }),
          ),
        );
      }

      return {
        placeholder: Effect.fn("DedicatedWorker.placeholder")(function* () {
          yield* Effect.logInfo("Placeholder RPC invoked");
        }),
      } satisfies Handlers;
    }).pipe(Effect.annotateLogs({ worker: "dedicated", localGraphId })),
  );
}

// TODO: reuse services building between dedicated workers and main thread
/** Builds the service layer for a specific graph. */
function buildServiceLayer(opts: {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
}) {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      displayName: opts.displayName,
      databasePath: `${opts.localGraphId}.sqlite3`,
    }),
  );
  const DBWithConfigLayer = Layer.provideMerge(SqlLive, ConfigLayer);
  const GraphSyncConfigLayer = Layer.succeed(
    GraphSyncConfig.Config,
    GraphSyncConfig.Config.of(opts.graphSyncConfig),
  );
  return Layer.mergeAll(
    DB.Service.Default,
    EventRepo.Service.Default,
    NoteRepo.Service.Default,
    BacklinkService.Service.Default,
    MaterializationCheckpointRepo.Service.Default,
    MaterializedEventService.Service.Default,
    MaterializerService.Service.Default,
    Socket.layerWebSocketConstructorGlobal,
    Logger.minimumLogLevel(LogLevel.Debug),
  ).pipe(
    // Keep DB.Config in the final layer output because downstream effects
    // still read it directly even after the service graph has been built.
    Layer.provide(GraphSyncConfigLayer),
    Layer.provideMerge(DBWithConfigLayer),
  );
}
