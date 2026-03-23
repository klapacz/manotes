/**
 * Orchestrates socket lifecycle and feeds inputs into the machine runner.
 */
import * as Socket from "@effect/platform/Socket";
import { Effect, Queue, Stream } from "effect";
import { decodeServerMessage } from "../contract/codec";
import * as DB from "../../db.service";
import * as EventRepo from "../../event.repo";
import * as Model from "./model";
import * as Runner from "./runner";

/**
 * Runs one socket session and converts external signals into machine inputs.
 *
 * Local pending rows and server messages both feed the same queue so the
 * state machine stays the only place that decides when commits are allowed.
 */
export const run = Effect.fn("GraphSyncMachineSession.run")(function* () {
  const eventRepo = yield* EventRepo.Service;
  const inputQueue = yield* Queue.unbounded<Model.Input>();

  const hasPendingStream = yield* eventRepo.streamHasPending();

  yield* hasPendingStream.pipe(
    Stream.changes,
    Stream.filter((hasPending) => hasPending),
    // Pending notifications are wake-up hints only; the machine re-reads the
    // actual pending rows before sending a commit.
    Stream.runForEach(() =>
      Queue.offer(inputQueue, Model.Input.PendingEvents()),
    ),
    Effect.forkScoped,
  );

  const socket = yield* createSocket();
  const write = yield* socket.writer;

  yield* socket
    .run(
      Effect.fn("GraphSyncMachineSession.handleSocketData")(function* (data) {
        const message = yield* decodeServerMessage(data);
        yield* Queue.offer(inputQueue, Model.Input.ServerMessage({ message }));
      }),
      {
        onOpen: Queue.offer(inputQueue, Model.Input.SocketOpened()),
      },
    )
    .pipe(
      Effect.ensuring(Queue.offer(inputQueue, Model.Input.SocketClosed())),
      Effect.forkScoped,
    );

  return yield* Runner.run({ inputQueue: inputQueue, write });
});

/**
 * Opens the graph-scoped websocket described by ADR-002.
 */
const createSocket = Effect.fn("GraphSyncMachineSession.createSocket")(
  function* () {
    const config = yield* DB.Config;
    const socketUrl = new URL(
      `/api/sync/${encodeURIComponent(config.displayName)}`,
      self.location.origin,
    );
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

    return yield* Socket.makeWebSocket(socketUrl.toString(), {
      openTimeout: "10 seconds",
    });
  },
);
