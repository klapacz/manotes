/**
 * Orchestrates socket lifecycle and feeds inputs into the machine runner.
 */
import { Socket } from "effect/socket";
import { Effect, Predicate, Queue, Stream, SubscriptionRef } from "effect";
import { decodeServerMessage } from "../contract/codec";
import { EventRepo } from "../../event.repo";
import { GraphSyncContext } from "../context";
import { GraphSyncStatus } from "../status";
import { GraphSyncModel } from "./model";
import { GraphSyncMachineRunner } from "./runner";
import { GraphSyncMachineErrors } from "./errors";
import { SyncStatusCloud } from "../status.schema";

/**
 * Runs one socket session and converts external signals into machine inputs.
 *
 * Local pending rows and server messages both feed the same queue so the
 * state machine stays the only place that decides when commits are allowed.
 */
export const run = Effect.fn("GraphSyncMachineSession.run")(function* () {
  const eventRepo = yield* EventRepo.Service;
  const statusRef = yield* GraphSyncStatus.Ref;

  const inputQueue = yield* Queue.unbounded<
    GraphSyncModel.Input,
    GraphSyncMachineErrors.RunnerQueueErrors
  >();

  const hasPendingStream = yield* eventRepo.streamHasPending();

  yield* hasPendingStream.pipe(
    Stream.changes,
    Stream.runForEach((hasPending) => {
      return Effect.gen(function* () {
        yield* SubscriptionRef.update(
          statusRef,
          (prev) => new SyncStatusCloud({ mode: prev.mode, syncState: prev.syncState, hasPending }),
        );

        // Pending notifications are wake-up hints only; the machine re-reads the
        // actual pending rows before sending a commit.
        if (hasPending) yield* Queue.offer(inputQueue, GraphSyncModel.Input.PendingEvents());
      });
    }),
    Effect.forkScoped,
  );

  const socket = yield* createSocket();
  const writer = yield* socket.writer;

  yield* Effect.gen(function* () {
    const reader = yield* socket.reader;
    yield* Queue.offer(inputQueue, GraphSyncModel.Input.SocketOpened());

    while (true) {
      const frames = yield* reader.pull;

      for (const data of frames) {
        const message = yield* decodeServerMessage(
          Predicate.isString(data) ? new TextEncoder().encode(data) : data,
        );

        yield* Queue.offer(inputQueue, GraphSyncModel.Input.ServerMessage({ message }));
      }
    }
  }).pipe(
    Effect.matchCauseEffect({
      // The queue's error channel carries socket lifecycle events so the
      // supervisor can distinguish normal closes from open failures. A clean
      // close produces no failure of its own, so we synthesize
      // SocketClosedError here to represent that case.
      onSuccess: () => Queue.fail(inputQueue, new GraphSyncMachineErrors.SocketClosedError()),
      onFailure: (cause) => Queue.failCause(inputQueue, cause),
    }),
    Effect.forkScoped,
  );

  return yield* GraphSyncMachineRunner.run({ inputQueue: inputQueue, write: writer.write });
});

/**
 * Opens the graph-scoped websocket described by ADR-002.
 */
const createSocket = Effect.fn("GraphSyncMachineSession.createSocket")(function* () {
  const sync = yield* GraphSyncContext.Context;

  const origin = sync.origin ?? self.location.origin;
  const socketUrl = new URL(`/api/sync/${encodeURIComponent(sync.graphId)}`, origin);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

  return yield* Socket.makeWebSocket(socketUrl.toString(), {
    openTimeout: "10 seconds",
  });
});

export * as Session from "./session";
