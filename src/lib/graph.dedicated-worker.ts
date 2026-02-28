import { BrowserRuntime, BrowserWorkerRunner } from "@effect/platform-browser";
import { WorkerRunner } from "@effect/platform";
import { Effect, Layer, Logger, LogLevel } from "effect";
import { RpcServer } from "@effect/rpc";
import type { RpcGroup } from "@effect/rpc";
import * as DB from "./db.service";
import {
  GraphDedicatedRpc,
  GraphDedicatedInitialMessage,
} from "./graph.worker-rpc";

// Bootstrap runner - receives MessagePort via initial message and installs
// the RPC server layer into the serialized runner context.
const BootstrapRunner = WorkerRunner.layerSerialized(
  GraphDedicatedInitialMessage,
  {
    // Key must match the _tag "InitialMessage" exactly — see GraphDedicatedInitialMessage.
    InitialMessage: ({ port, graphName }) =>
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

      // Validate DB access by running a simple effect
      yield* DB.Service;
      yield* Effect.logInfo("DB.Service initialized");

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

  return Layer.mergeAll(
    DB.Service.Default,
    Logger.minimumLogLevel(LogLevel.Debug),
  ).pipe(Layer.provide(ConfigLayer));
}
