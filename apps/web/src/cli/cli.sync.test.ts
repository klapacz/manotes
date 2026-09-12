import { Effect, Fiber, Latch, Layer, SubscriptionRef } from "effect";
import { TestClock } from "effect/testing";
import * as Socket from "effect/unstable/socket/Socket";
import { describe, expect, it } from "vite-plus/test";
import * as EventRepo from "../lib/event.repo";
import * as GraphSync from "../lib/graph-sync/service";
import * as GraphSyncContext from "../lib/graph-sync/context";
import * as GraphSyncEventLog from "../lib/graph-sync/event-log.service";
import * as GraphSyncErrors from "../lib/graph-sync/machine/errors";
import * as GraphSyncModel from "../lib/graph-sync/machine/model";
import * as GraphSyncStatus from "../lib/graph-sync/status";
import { SyncStatusCloud } from "../lib/graph.worker-rpc";
import { CliSync } from "./cli.sync";

// The mocked session retains its production dependency types. Fail if the CLI
// unexpectedly tries to use them instead of observing the session's status.
const unusedSessionDependencies = Layer.mergeAll(
  Layer.succeed(GraphSyncContext.Context, { graphId: "test-graph", graphKey: new Uint8Array() }),
  Layer.mock(EventRepo.Service, {}),
  Layer.mock(GraphSyncEventLog.Service, {}),
  Layer.succeed(Socket.WebSocketConstructor, () => {
    throw new Error("Unexpected WebSocket construction in CliSync test");
  }),
);

const initialStatus = () =>
  new SyncStatusCloud({
    mode: "cloud",
    syncState: "Disconnected",
    hasPending: false,
  });

describe("CliSync.run", () => {
  it("waits for Ready and stops the background session on completion", async () => {
    let sessionStopped = false;
    await Effect.runPromise(
      Effect.gen(function* () {
        const sessionStarted = yield* Latch.make();
        const statusRef = yield* SubscriptionRef.make(initialStatus());

        const session = sessionStarted.open.pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Effect.sync(() => {
              sessionStopped = true;
            }),
          ),
        );

        const fiber = yield* CliSync.run().pipe(
          Effect.provideService(GraphSyncStatus.Ref, statusRef),
          Effect.provide(Layer.mock(GraphSync.Service, { run: () => session })),
          Effect.provide(unusedSessionDependencies),
          Effect.forkChild,
        );

        yield* sessionStarted.await;
        yield* SubscriptionRef.set(
          statusRef,
          new SyncStatusCloud({
            mode: "cloud",
            syncState: "Committing",
            hasPending: true,
          }),
        );
        yield* Effect.sleep("10 millis");
        expect(fiber.pollUnsafe()).toBeUndefined();

        // The machine checks pending rows before entering Ready. The separately
        // updated hasPending field can lag behind that transition.
        yield* SubscriptionRef.set(
          statusRef,
          new SyncStatusCloud({
            mode: "cloud",
            syncState: "Ready",
            hasPending: true,
          }),
        );
        yield* Fiber.join(fiber);
        expect(sessionStopped).toBe(true);
      }),
    );
  });

  it("propagates a failed background session", async () => {
    const program = Effect.gen(function* () {
      const statusRef = yield* SubscriptionRef.make(initialStatus());
      yield* CliSync.run().pipe(
        Effect.provideService(GraphSyncStatus.Ref, statusRef),
        Effect.provide(
          Layer.mock(GraphSync.Service, {
            run: () => Effect.fail(new GraphSyncErrors.SocketClosedError()),
          }),
        ),
        Effect.provide(unusedSessionDependencies),
      );
    });

    await expect(Effect.runPromise(program)).rejects.toThrow("Graph sync socket closed");
  });

  it("fails if the session ends without publishing Ready", async () => {
    const program = Effect.gen(function* () {
      const statusRef = yield* SubscriptionRef.make(initialStatus());
      yield* CliSync.run().pipe(
        Effect.provideService(GraphSyncStatus.Ref, statusRef),
        Effect.provide(
          Layer.mock(GraphSync.Service, {
            run: () => Effect.succeed(GraphSyncModel.State.Ready()),
          }),
        ),
        Effect.provide(unusedSessionDependencies),
      );
    });

    await expect(Effect.runPromise(program)).rejects.toThrow(
      "Graph sync session ended before synchronization.",
    );
  });

  it("times out if the session never reaches Ready", async () => {
    const program = Effect.gen(function* () {
      const sessionStarted = yield* Latch.make();
      const statusRef = yield* SubscriptionRef.make(initialStatus());

      const fiber = yield* CliSync.run().pipe(
        Effect.provideService(GraphSyncStatus.Ref, statusRef),
        Effect.provide(
          Layer.mock(GraphSync.Service, {
            run: () => sessionStarted.open.pipe(Effect.andThen(Effect.never)),
          }),
        ),
        Effect.provide(unusedSessionDependencies),
        Effect.forkChild,
      );

      yield* sessionStarted.await;
      yield* Effect.yieldNow;
      yield* TestClock.adjust("1 hour");
      yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer()));

    await expect(Effect.runPromise(program)).rejects.toThrow(
      "Graph sync timed out before synchronization.",
    );
  });
});
