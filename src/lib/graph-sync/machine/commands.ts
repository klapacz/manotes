/**
 * Implements machine side effects like log updates and socket writes.
 */
import { Effect, Option } from "effect";
import * as Messages from "../contract/messages";
import * as GraphSyncEventLog from "../event-log.service";
import * as GraphSyncContext from "../context";
import * as MachineContext from "./context";
import type { NonEmptyReadonlyArray } from "effect/Array";

/**
 * Applies committed batches in order through the shared local event log.
 */
export const applyEventsFromMessages = Effect.fn(
  "GraphSyncMachineCommands.applyEventsFromMessages",
)(function* (
  messages: ReadonlyArray<{
    events: NonEmptyReadonlyArray<Messages.CommittedEvent>;
  }>,
) {
  const eventLog = yield* GraphSyncEventLog.Service;
  yield* Effect.forEach(
    messages,
    Effect.fnUntraced(function* (message) {
      yield* eventLog.applyCommittedEvents(message.events);
    }),
    { discard: true },
  );
});

export const ensureLastCommitSeqEquals = Effect.fn(
  "GraphSyncMachineCommands.ensureLastCommitSeqEquals",
)(function* (expected: number) {
  const eventLog = yield* GraphSyncEventLog.Service;
  yield* eventLog.ensureLastCommitSeqEquals(expected);
});

export const sendConnect = Effect.fn("GraphSyncMachineCommands.sendConnect")(
  function* () {
    const context = yield* MachineContext.GraphSyncMachineContext;
    const sync = yield* GraphSyncContext.Context;
    const eventLog = yield* GraphSyncEventLog.Service;
    const lastCommitSeq = yield* eventLog.getLastCommitSeq();

    yield* context.write(
      new Messages.Connect({
        graphId: sync.graphId,
        lastCommitSeq,
      }),
    );

    yield* Effect.logInfo("Sent connect to graph sync server", {
      graphId: sync.graphId,
      lastCommitSeq,
    });
  },
);

/**
 * Re-reads pending local rows and sends at most one commit batch.
 *
 * The machine relies on the returned flag to decide whether it should stay
 * `Ready` or move into the single in-flight `Committing` phase.
 */
export const sendPendingCommit = Effect.fn(
  "GraphSyncMachineCommands.sendPendingCommit",
)(function* () {
  const context = yield* MachineContext.GraphSyncMachineContext;
  const eventLog = yield* GraphSyncEventLog.Service;
  const pendingCommit = yield* eventLog.getPendingCommit();

  if (Option.isNone(pendingCommit)) {
    return { didSendCommit: false };
  }

  yield* context.write(
    new Messages.Commit({
      baseCommitSeq: pendingCommit.value.baseCommitSeq,
      events: pendingCommit.value.events,
    }),
  );

  return { didSendCommit: true };
});
