import { BrowserWorker } from "@effect/platform-browser";
import { Duration, Effect, Exit, Layer, Schedule, Scope, Context } from "effect";
import { RpcClient, RpcClientError, RpcGroup, RpcWorker } from "effect/unstable/rpc";
import * as DB from "./db.service";
import * as GraphSyncConfig from "./graph-sync/config";
import {
  GraphSharedWorkerRpc,
  GraphSharedInitialMessageSchema,
  GraphDedicatedInitialMessage,
} from "./graph.worker-rpc";
import * as LeaderElection from "./leader-election";

// Type for the SharedWorker RPC client
type GraphSharedRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof GraphSharedWorkerRpc>,
  RpcClientError.RpcClientError
>;

/**
 * Creates a dedicated worker and returns the port2 for SharedWorker communication.
 * This should only be called by the leader tab.
 *
 * On scope close, `acquireRelease` terminates the worker process while
 * Effect's close protocol (via `makeSerialized` / `WorkerRunner.launch`)
 * handles port and fiber cleanup.
 */
const createDedicatedWorker = Effect.fn("GraphWorkerClient.createDedicatedWorker")(function* ({
  localGraphId,
  graphSyncConfig,
}: {
  localGraphId: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
}) {
  // Create MessageChannel - ports will be distributed to both workers.
  const mc = new MessageChannel();

  // Effect's close protocol cleans up ports/fibers, but doesn't terminate
  // the worker process (it would linger idle). Matters during retries.
  const worker = yield* Effect.acquireRelease(
    Effect.sync(() => {
      // Safari can evaluate the module worker after `new Worker(...)` returns.
      // We therefore wait for Effect's worker runner to announce readiness
      // before sending the RPC initial message.
      const ready = Promise.withResolvers<void>();
      const worker = new Worker(new URL("./graph.dedicated-worker.ts", import.meta.url), {
        type: "module",
        name: `graph-dedicated-${localGraphId}`,
      });

      const onMessage = (event: MessageEvent) => {
        // Effect's browser worker runner sends `[0]` as its "ready" handshake.
        // We only care about that one control message here; everything else is
        // handled by Effect's own worker transport after bootstrap completes.
        if (Array.isArray(event.data) && event.data[0] === 0) ready.resolve();
      };
      worker.addEventListener("message", onMessage);

      return { worker, onMessage, ready: ready.promise };
    }),
    Effect.fnUntraced(function* ({ worker, onMessage }) {
      yield* Effect.sync(() => {
        worker.removeEventListener("message", onMessage);
        worker.terminate();
      });
    }),
  ).pipe(
    Effect.flatMap(
      Effect.fnUntraced(function* ({ worker, ready }) {
        // Install cleanup first, then wait for readiness. If the timeout fires,
        // the surrounding scope still owns the worker and will terminate it.
        yield* Effect.promise(() => ready).pipe(Effect.timeout("5 seconds"));
        return worker;
      }),
    ),
  );

  const [initialMessage, transferables] = yield* RpcWorker.makeInitialMessage(
    GraphDedicatedInitialMessage,
    Effect.succeed(
      new GraphDedicatedInitialMessage({
        port: mc.port1,
        localGraphId,
        graphSyncConfig,
      }),
    ),
  );

  // Send port1 to the dedicated worker via initial message.
  yield* Effect.sync(() =>
    worker.postMessage(
      [0, { _tag: "InitialMessage", value: initialMessage }],
      transferables as any,
    ),
  );

  yield* Effect.logInfo("Created dedicated worker");

  return mc.port2;
});

/** Layer that provides `InitialMessage` from `DB.Config`. */
const SharedInitialMessageLayer = RpcWorker.layerInitialMessage(
  GraphSharedInitialMessageSchema,
  Effect.gen(function* () {
    const config = yield* DB.Config;
    const graphSyncConfig = yield* GraphSyncConfig.Config;
    return {
      localGraphId: config.localGraphId,
      graphSyncMode: graphSyncConfig.mode,
    };
  }),
);

/** SharedWorker RPC protocol layer. */
const SharedRpcProtocol = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DB.Config;

    // Create SharedWorker layer
    const sharedWorkerLayer = BrowserWorker.layer(
      () =>
        new SharedWorker(new URL("./graph.shared-worker.ts", import.meta.url), {
          type: "module",
          name: `graph-worker-${config.localGraphId}`,
        }),
    );

    return RpcClient.layerProtocolWorker({
      size: 1,
      // healthStream is long-lived, so allow unary RPCs (placeholder/updateMessagePort)
      // to run concurrently on the same worker connection.
      concurrency: 16,
    }).pipe(
      Layer.provide(sharedWorkerLayer),
      Layer.provide(SharedInitialMessageLayer),
      Layer.orDie,
    );
  }),
);

/**
 * GraphWorkerClient.Service
 *
 * Manages the connection between main thread and the dual-worker system:
 * - SharedWorker: shared across all tabs, routes RPC requests
 * - Dedicated Worker: owned by leader tab only, handles OPFS/SQLite
 *
 * Leader election ensures only one Dedicated Worker exists per graph.
 * Followers use the SharedWorker which forwards to the leader's Dedicated Worker.
 */
export class Service extends Context.Service<Service>()("GraphWorkerClient.Service", {
  make: Effect.gen(function* () {
    const config = yield* DB.Config;
    const graphSyncConfig = yield* GraphSyncConfig.Config;
    const localGraphId = config.localGraphId;

    yield* Effect.annotateLogsScoped({ localGraphId });

    // Create RPC client for SharedWorker (all tabs have this)
    const sharedClient = yield* RpcClient.make(GraphSharedWorkerRpc);
    const serviceApi = { client: sharedClient };

    // Try to become leader immediately (non-blocking check)
    const role = yield* LeaderElection.resolveRole(localGraphId);

    yield* Effect.annotateLogsScoped({ initialRole: role });

    if (role === "leader") {
      // We're the leader - setup worker in the background (it doesn't have to be available right away)
      yield* becomeLeader(sharedClient, {
        localGraphId,
        graphSyncConfig,
      }).pipe(Effect.forkScoped);

      return serviceApi;
    }

    // We're a follower: wait for leadership and attempt takeover in background.
    yield* Effect.gen(function* () {
      yield* Effect.logInfo("Waiting for leadership");
      yield* LeaderElection.waitForLeadership(localGraphId);

      yield* becomeLeader(sharedClient, {
        localGraphId,
        graphSyncConfig,
      });
    }).pipe(Effect.forkScoped);

    return serviceApi;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(SharedRpcProtocol));
}

/**
 * Becomes the leader: creates dedicated worker and sends port to SharedWorker. Retries on failure.
 */
const becomeLeader = Effect.fn("GraphWorkerClient.becomeLeader")(function* (
  sharedClient: GraphSharedRpcClient,
  config: {
    localGraphId: string;
    graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
  },
) {
  yield* Effect.logInfo("Became leader");

  // Retry worker creation - a transferred MessagePort can't be reused, so on failure we recreate everything.
  const retrySchedule = Schedule.exponential("50 millis").pipe(
    Schedule.tapOutput((delay) =>
      Effect.logWarning(`Retrying worker creation in ${Duration.toMillis(delay)}ms`),
    ),
  );

  // Scope lifecycle for retry resilience:
  //
  // We fork a child scope from the parent for each attempt. The worker and
  // MessagePort are acquired inside this child scope via `Scope.extend`.
  //
  // - On SUCCESS: the child scope stays open, keeping the dedicated worker
  //   fiber alive. It will be closed when the parent scope closes (tab unload).
  //
  // - On FAILURE (e.g. createDedicatedWorker succeeds but updateMessagePort
  //   fails): `onError` explicitly closes the child scope, which terminates
  //   the worker. The retry then creates a fresh scope, worker, and
  //   MessageChannel — necessary because a transferred MessagePort cannot be
  //   reused after failure.
  yield* Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const workerScope = yield* Scope.fork(scope, "sequential");

    yield* Effect.gen(function* () {
      // This can hang if the dedicated worker crashes during module evaluation
      // before WorkerRunner sends its initial ready message. Effect's internal
      // worker listener retries in the background, so this call may neither
      // succeed nor fail promptly unless we add our own timeout.
      const dedicatedWorkerPort = yield* createDedicatedWorker(config);

      // Sends the dedicated worker's port2 to the SharedWorker via RPC.
      // Note: with the current SharedWorker implementation, attach failures can
      // be logged and reflected in health state there without surfacing back to
      // this caller as an RPC failure, so the leader may not retry on them.
      yield* sharedClient.updateMessagePort({ port: dedicatedWorkerPort });

      yield* Effect.logInfo("MessagePort sent to SharedWorker");
    }).pipe(
      Scope.provide(workerScope),
      Effect.onError((cause) => Scope.close(workerScope, Exit.failCause(cause))),
    );
  }).pipe(Effect.retry(retrySchedule), Effect.withLogSpan("workerSetup"));
});
