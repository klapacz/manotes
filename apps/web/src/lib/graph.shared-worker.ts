import { BrowserRuntime, BrowserWorkerRunner, BrowserWorker } from "@effect/platform-browser";
import {
  Cause,
  Effect,
  Layer,
  Match,
  Option,
  References,
  Scope,
  ScopedRef,
  Stream,
  SubscriptionRef,
} from "effect";
import {
  RpcClient,
  RpcClientError,
  RpcGroup,
  RpcSerialization,
  RpcServer,
  RpcWorker,
} from "effect/unstable/rpc";
import {
  GraphSharedWorkerRpc,
  GraphSharedInitialMessageSchema,
  GraphDedicatedRpc,
  DedicatedWorkerHealth,
  SyncStatusLocal,
  SyncStatusCloud,
  type SyncStatus,
} from "./graph.worker-rpc";

// ============================================================================
// SharedWorker - Request Router
// ============================================================================
//
// This SharedWorker is shared across ALL tabs for a given graph.
// It does NOT access the database directly - it only routes requests.
//
// Architecture:
//   [Tab A (leader)] ---> [SharedWorker] ---> [Dedicated Worker (OPFS/SQLite)]
//   [Tab B (follower)] ----^
//   [Tab C (follower)] ----^
//
// The leader tab creates a Dedicated Worker and sends its MessagePort here.
// All tabs (including leader) send RPC requests through this SharedWorker.
// This worker forwards those requests to the Dedicated Worker via the port.
//
// On leader failover:
//   1. Old leader closes -> old Dedicated Worker dies
//   2. New leader acquires lock -> creates new Dedicated Worker
//   3. New leader sends new MessagePort via updateMessagePort RPC
//   4. This worker replaces the old port reference with the new one
//
// ============================================================================

// Type for the dedicated worker client
type DedicatedClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof GraphDedicatedRpc>,
  RpcClientError.RpcClientError
>;

const RpcHandler = GraphSharedWorkerRpc.toLayer(
  Effect.gen(function* () {
    // Receive localGraphId via initial message
    const initialMessage = yield* RpcWorker.initialMessage(GraphSharedInitialMessageSchema);
    const { localGraphId } = initialMessage;
    const logsAnnotation = { worker: "shared", localGraphId };
    const annotateHandler = Effect.annotateLogs(logsAnnotation);
    yield* Effect.annotateLogsScoped(logsAnnotation);

    yield* Effect.logInfo("Started");

    const parentScope = yield* Effect.scope;

    // Ref to hold the dedicated worker client (set when updateMessagePort is called)
    const dedicatedWorkerRef = yield* Scope.provide(
      // ScopedRef automatically releases previous connection resources on replacement.
      ScopedRef.fromAcquire(Effect.succeed<Option.Option<DedicatedClient>>(Option.none())),
      parentScope,
    );

    const dedicatedWorkerHealth = yield* createDedicatedWorkerHealth;

    const syncStatusRef = yield* SubscriptionRef.make<SyncStatus>(
      getDisconnectedSyncStatus(initialMessage.graphSyncMode),
    );

    return {
      // Called by the leader tab to register its Dedicated Worker's MessagePort.
      // On leader failover, this is called again by the new leader with a new port.
      updateMessagePort: Effect.fn("SharedWorker.updateMessagePort")(
        function* (payload) {
          yield* Effect.logInfo("Received MessagePort from leader");

          const existingConnection = yield* ScopedRef.get(dedicatedWorkerRef);

          if (Option.isSome(existingConnection)) {
            yield* Effect.logInfo("Replacing existing connection (leader failover)");
          }

          // Swapping the ScopedRef value guarantees old connection cleanup.
          const connected = yield* ScopedRef.set(
            dedicatedWorkerRef,
            acquireDedicatedConnection(payload.port, syncStatusRef).pipe(Effect.map(Option.some)),
          ).pipe(
            Effect.as(true),
            Effect.catchCause((cause) =>
              Effect.gen(function* () {
                yield* dedicatedWorkerHealth.setStatus(
                  "down",
                  `Failed to create dedicated worker client: ${Cause.pretty(cause)}`,
                );
                yield* Effect.logError("Failed to create dedicated worker client", cause);

                return false;
              }),
            ),
          );

          if (!connected) return; // Keep previous health state updates and fail soft for this RPC call.

          yield* dedicatedWorkerHealth.markHealthy;

          yield* Effect.logInfo("Connected to dedicated worker");
        },
        (effect) => effect.pipe(annotateHandler),
      ),

      // Forward placeholder requests to the Dedicated Worker.
      // Kept as a future RPC hook. Correctness does not depend on this path.
      placeholder: Effect.fn("SharedWorker.placeholder")(
        function* (payload) {
          const current = yield* ScopedRef.get(dedicatedWorkerRef);

          yield* Effect.logInfo("Forwarding placeholder request");

          if (Option.isNone(current)) {
            yield* dedicatedWorkerHealth.setStatus("down", "No dedicated worker available");
            yield* Effect.logWarning("No dedicated worker connected yet");

            return;
          }

          yield* Effect.matchCauseEffect(current.value.placeholder(payload), {
            onFailure: Effect.fn(function* (cause) {
              yield* dedicatedWorkerHealth.setStatus(
                "degraded",
                `Placeholder RPC failed: ${Cause.pretty(cause)}`,
              );

              yield* Effect.logError("Placeholder RPC failed in dedicated worker", cause);
            }),

            onSuccess: Effect.fn(function* () {
              yield* Effect.logInfo("Placeholder RPC succeeded");
              yield* dedicatedWorkerHealth.markHealthy;
            }),
          });
        },
        (effect) => effect.pipe(annotateHandler),
      ),

      healthStream: () => SubscriptionRef.changes(dedicatedWorkerHealth.ref),

      syncStatusStream: () => SubscriptionRef.changes(syncStatusRef),
    };
  }),
);

const createDedicatedWorkerHealth = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make(
    new DedicatedWorkerHealth({
      status: "down",
      consecutiveFailures: 0,
      lastFailure: "No dedicated worker connected yet",
    }),
  );

  return {
    ref,
    markHealthy: SubscriptionRef.set(
      ref,
      new DedicatedWorkerHealth({
        status: "healthy",
        consecutiveFailures: 0,
        lastFailure: "",
      }),
    ),

    setStatus: Effect.fn(function* (status: "degraded" | "down", message: string) {
      yield* SubscriptionRef.update(
        ref,
        (previous) =>
          new DedicatedWorkerHealth({
            status,
            consecutiveFailures: previous.consecutiveFailures + 1,
            lastFailure: message,
          }),
      );
    }),
  };
});

const RpcWorkerServer = RpcServer.layer(GraphSharedWorkerRpc).pipe(
  Layer.provide(RpcHandler),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
  Layer.provide(Layer.succeed(References.MinimumLogLevel, "Debug")),
);

BrowserRuntime.runMain(
  Effect.tapCause(Layer.launch(RpcWorkerServer), (error) =>
    Effect.logError("SharedWorker fatal error", error),
  ),
);

const acquireDedicatedConnection = Effect.fn("SharedWorker.acquireDedicatedConnection")(function* (
  port: MessagePort,
  syncStatusRef: SubscriptionRef.SubscriptionRef<SyncStatus>,
) {
  // Close this transferred port when the ScopedRef entry is released.
  // Register the finalizer first so client setup failures still close it.
  yield* Effect.addFinalizer(() => Effect.sync(() => port.close()));

  // Reset sync status when this connection is released (failover, failure, etc.)
  yield* Effect.addFinalizer(() =>
    SubscriptionRef.update(syncStatusRef, (current) => getDisconnectedSyncStatus(current.mode)),
  );

  const layer = Layer.mergeAll(
    RpcClient.layerProtocolWorker({ size: 1, concurrency: 16 }).pipe(
      Layer.provide(BrowserWorker.layer(() => port)),
    ),
    RpcSerialization.layerJson,
  );

  // Build the protocol layer into the current acquire scope so it stays alive
  // for the whole ScopedRef lifetime (until replaced / released).
  const context = yield* Layer.build(layer);
  const client = yield* RpcClient.make(GraphDedicatedRpc).pipe(Effect.provide(context));

  // Subscribe to the dedicated worker's sync status and pipe to the local ref.
  yield* client.syncStatusStream({}).pipe(
    Stream.runForEach((status) => SubscriptionRef.set(syncStatusRef, status)),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("syncStatusStream from dedicated worker failed", cause);
        yield* SubscriptionRef.update(syncStatusRef, (current) =>
          getDisconnectedSyncStatus(current.mode),
        );
      }),
    ),
    Effect.forkScoped,
  );

  return client;
});

const getDisconnectedSyncStatus = Match.type<SyncStatus["mode"]>().pipe(
  Match.when(
    "cloud",
    () =>
      new SyncStatusCloud({
        mode: "cloud",
        syncState: "Disconnected",
        hasPending: false,
      }),
  ),
  Match.when("local", () => new SyncStatusLocal({ mode: "local" })),
  Match.exhaustive,
);
