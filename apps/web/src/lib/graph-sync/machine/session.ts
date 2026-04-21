/**
 * Orchestrates socket lifecycle and feeds inputs into the machine runner.
 */
import { Socket } from "effect/unstable/socket";
import { Effect, Queue, Stream, SubscriptionRef } from "effect";
import { decodeServerMessage } from "@manotes/shared/graph-sync/contract/codec";
import * as EventRepo from "../../event.repo";
import * as GraphSyncContext from "../context";
import * as Status from "../status";
import * as Model from "./model";
import * as Runner from "./runner";
import * as Errors from "./errors";
import { SyncStatusCloud } from "../../graph.worker-rpc";

/**
 * Runs one socket session and converts external signals into machine inputs.
 *
 * Local pending rows and server messages both feed the same queue so the
 * state machine stays the only place that decides when commits are allowed.
 */
export const run = Effect.fn("GraphSyncMachineSession.run")(function* () {
  const eventRepo = yield* EventRepo.Service;
  const statusRef = yield* Status.Ref;
  const inputQueue = yield* Queue.unbounded<Model.Input, Errors.RunnerQueueErrors>();

  const hasPendingStream = yield* eventRepo.streamHasPending();

  yield* hasPendingStream.pipe(
    Stream.changes,
    Stream.runForEach((hasPending) =>
      Effect.gen(function* () {
        yield* SubscriptionRef.update(
          statusRef,
          (prev) => new SyncStatusCloud({ mode: prev.mode, syncState: prev.syncState, hasPending }),
        );

        // Pending notifications are wake-up hints only; the machine re-reads the
        // actual pending rows before sending a commit.
        if (hasPending) {
          yield* Queue.offer(inputQueue, Model.Input.PendingEvents());
        }
      }),
    ),
    Effect.forkScoped,
  );

  const socket = yield* createSocket();
  const write = yield* socket.writer;

  yield* socket
    .run(
      Effect.fn("GraphSyncMachineSession.handleSocketData")(function* (data) {
        const message = yield* decodeServerMessage(new Uint8Array(data));
        yield* Queue.offer(inputQueue, Model.Input.ServerMessage({ message }));
      }),
      {
        onOpen: Queue.offer(inputQueue, Model.Input.SocketOpened()),
      },
    )
    .pipe(
      Effect.matchCauseEffect({
        // The queue's error channel carries socket lifecycle events so the
        // supervisor can distinguish normal closes from open failures. A clean
        // close produces no failure of its own, so we synthesize
        // SocketClosedError here to represent that case.
        onSuccess: () => Queue.fail(inputQueue, new Errors.SocketClosedError()),
        onFailure: (cause) => Queue.failCause(inputQueue, cause),
      }),
      Effect.forkScoped,
    );

  return yield* Runner.run({ inputQueue: inputQueue, write });
});

/**
 * Opens the graph-scoped websocket described by ADR-002.
 */
const createSocket = Effect.fn("GraphSyncMachineSession.createSocket")(function* () {
  const sync = yield* GraphSyncContext.Context;

  const socketUrl = new URL(`/api/sync/${encodeURIComponent(sync.graphId)}`, self.location.origin);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

  return yield* Socket.makeWebSocket(socketUrl.toString(), {
    openTimeout: "10 seconds",
  });
});
