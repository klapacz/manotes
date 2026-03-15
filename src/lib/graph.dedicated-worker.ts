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
import * as MaterializerService from "./materializer.service";
import * as NoteRepo from "./note.repo";
import * as GraphSync from "./graph-sync/service";
import * as GraphSyncEventLog from "./graph-sync/event-log.service";
import {
  GraphDedicatedRpc,
  GraphDedicatedInitialMessage,
} from "./graph.worker-rpc";
import { SqlLive } from "./db.service";

// Bootstrap runner - receives MessagePort via initial message and installs
// the RPC server layer into the serialized runner context.
const BootstrapRunner = WorkerRunner.layerSerialized(
  GraphDedicatedInitialMessage,
  {
    // Key must match the _tag "InitialMessage" exactly — see GraphDedicatedInitialMessage.
    InitialMessage: ({ port, graphName }): Layer.Layer<never, never, never> =>
      Layer.unwrapEffect(
        Effect.gen(function* () {
          yield* Effect.logInfo(`Received port`);

          // Build the service layer for the RPC server
          const serviceLayer = buildServiceLayer(graphName);

          // Return a layer so WorkerRunner keeps it alive in its internal scope.
          return RpcServer.layer(GraphDedicatedRpc).pipe(
            Layer.provide(makeRpcHandler(graphName)),
            Layer.provide(RpcServer.layerProtocolWorkerRunner),
            // Listen on the transferred MessagePort instead of self.
            Layer.provide(BrowserWorkerRunner.layerMessagePort(port)),
            Layer.provide(serviceLayer),
            Layer.orDie,
          );
        }).pipe(Effect.annotateLogs({ worker: "dedicated", graphName })),
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
function makeRpcHandler(graphName: string) {
  return GraphDedicatedRpc.toLayer(
    Effect.gen(function* () {
      yield* Effect.logInfo("RPC handler started");

      const materializer = yield* MaterializerService.Service;
      const graphSync = yield* GraphSync.Service;

      yield* materializer.start().pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("Materializer failed", cause),
        ),
        Effect.forkScoped,
      );

      yield* graphSync.start().pipe(
        Effect.catchAllCause((cause) =>
          Effect.logError("Graph sync failed", cause),
        ),
        Effect.forkScoped,
      );

      return {
        placeholder: Effect.fn("DedicatedWorker.placeholder")(function* () {
          yield* Effect.logInfo("Placeholder RPC invoked");
        }),
      } satisfies Handlers;
    }).pipe(Effect.annotateLogs({ worker: "dedicated", graphName })),
  );
}

// TODO: reuse services building between dedicated workers and main thread
/** Builds the service layer for a specific graph. */
function buildServiceLayer(graphName: string) {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      graphName,
      databasePath: `${graphName}.sqlite3`,
      allowCreate: false, // Worker assumes DB already exists and is migrated
    }),
  );
  const DBWithConfigLayer = Layer.provideMerge(SqlLive, ConfigLayer);

  return Layer.mergeAll(
    DB.Service.Default,
    EventRepo.Service.Default,
    NoteRepo.Service.Default,
    MaterializationCheckpointRepo.Service.Default,
    MaterializedEventService.Service.Default,
    MaterializerService.Service.Default,
    GraphSync.Service.Default,
    GraphSyncEventLog.Service.Default,
    Socket.layerWebSocketConstructorGlobal,
    Logger.minimumLogLevel(LogLevel.Debug),
  ).pipe(
    // Keep DB.Config in the final layer output because downstream effects
    // still read it directly even after the service graph has been built.
    Layer.provideMerge(DBWithConfigLayer),
  );
}
