/**
 * Handles each input for each graph sync machine state.
 */
import { Effect, Match, Types, pipe } from "effect";
import * as Model from "./model";
import * as Commands from "./commands";
import * as Errors from "./errors";
import * as Transition from "./transition";

/**
 * Handles the initial catch-up phase.
 *
 * `Committed` messages are buffered until a validated `ReplayDone` confirms the
 * local log is caught up to a contiguous server prefix.
 */
export function bootstrapping(
  state: Types.ExtractTag<Model.State, "Bootstrapping">,
  input: Model.Input,
) {
  return Match.value(input).pipe(
    Match.tagsExhaustive({
      SocketOpened: () =>
        pipe(Commands.sendConnect(), Transition.stayInState(state)),
      // Local writes can keep happening during catch-up, but they must not be
      // pushed until the socket has confirmed the current committed prefix.
      PendingEvents: () => pipe(Effect.void, Transition.stayInState(state)),
      ServerMessage: ({ message }) =>
        Match.value(message).pipe(
          Match.tagsExhaustive({
            Replay: (message) =>
              pipe(
                Commands.applyEventsFromMessages([message]),
                Transition.stayInState(state),
              ),
            ReplayDone: ({ upToCommitSeq }) =>
              pipe(
                Commands.ensureLastCommitSeqEquals(upToCommitSeq),
                Effect.andThen(
                  Commands.applyEventsFromMessages(state.bufferedCommitted),
                ),
                // Once catch-up is complete, immediately re-check local pending
                // rows so edits made during bootstrap do not wait for another
                // notification edge.
                Effect.andThen(Transition.readyOrCommitPending),
              ),
            Committed: (committed) =>
              Transition.bufferCommitted(state, committed),
            CommitAck: (message) =>
              // `CommitAck` only makes sense after this client has sent a
              // commit, so seeing it during bootstrap means the protocol is out
              // of sync and the session should fail fast.
              Effect.fail(
                new Errors.UnexpectedServerMessageError({
                  stateTag: state._tag,
                  messageTag: message._tag,
                }),
              ),
          }),
        ),
      SocketClosed: () => Effect.fail(new Errors.SocketClosedError()),
    }),
  );
}

/**
 * Handles the steady state where local commits may be sent immediately.
 */
export function ready(
  state: Types.ExtractTag<Model.State, "Ready">,
  input: Model.Input,
) {
  return Match.value(input).pipe(
    Match.tagsExhaustive({
      PendingEvents: Transition.readyOrCommitPending,
      ServerMessage: ({ message }) =>
        Match.value(message).pipe(
          Match.tag("Committed", (message) =>
            pipe(
              Commands.applyEventsFromMessages([message]),
              // Applying a remote batch can reveal that local pending work is
              // now ready to send from the updated tip.
              Effect.andThen(Transition.readyOrCommitPending),
            ),
          ),
          Match.tag("Replay", "ReplayDone", "CommitAck", (message) =>
            // In `Ready`, the client is already caught up and has no in-flight
            // commit, so these messages indicate a broken message sequence.
            Effect.fail(
              new Errors.UnexpectedServerMessageError({
                stateTag: state._tag,
                messageTag: message._tag,
              }),
            ),
          ),
          Match.exhaustive,
        ),
      SocketClosed: () => Effect.fail(new Errors.SocketClosedError()),
      SocketOpened: () =>
        // A session should observe exactly one socket open transition.
        Effect.fail(
          new Errors.DuplicateConnectError({
            stateTag: state._tag,
          }),
        ),
    }),
  );
}

/**
 * Handles the single in-flight commit phase.
 *
 * While waiting for `CommitAck` or stale-base replay, incoming `Committed`
 * batches are buffered so they can be applied only after the current commit is
 * resolved against the local log.
 */
export function committing(
  state: Types.ExtractTag<Model.State, "Committing">,
  input: Model.Input,
) {
  return Match.value(input).pipe(
    Match.tagsExhaustive({
      // Another pending notification does not matter while one commit is
      // already in flight; the machine re-reads pending rows after it resolves.
      PendingEvents: () => pipe(Effect.void, Transition.stayInState(state)),
      ServerMessage: ({ message }) =>
        Match.value(message).pipe(
          Match.tagsExhaustive({
            CommitAck: (message) =>
              pipe(
                Commands.applyEventsFromMessages([message]),
                Effect.andThen(
                  Commands.applyEventsFromMessages(state.bufferedCommitted),
                ),
                // After the in-flight commit is reflected locally, re-check for
                // more unsent rows before returning to `Ready`.
                Effect.andThen(Transition.readyOrCommitPending),
              ),
            Replay: (message) =>
              pipe(
                Commands.applyEventsFromMessages([message]),
                Transition.stayInState(state),
              ),
            ReplayDone: ({ upToCommitSeq }) =>
              pipe(
                Commands.ensureLastCommitSeqEquals(upToCommitSeq),
                Effect.andThen(
                  Commands.applyEventsFromMessages(state.bufferedCommitted),
                ),
                // We intentionally do not track whether this `ReplayDone` was
                // preceded by `Replay` while `Committing`. A bare `ReplayDone`
                // is treated as a no-op stale-base resolution because the local
                // event log remains the source of truth: if the in-flight batch
                // was not actually committed, its rows still have `commitSeq`
                // null and `readyOrCommitPending()` will retry them.
                // A replay here means the local base cursor was stale, so once
                // the missing suffix is applied we can decide whether to retry
                // the pending commit immediately.
                Effect.andThen(Transition.readyOrCommitPending),
              ),
            Committed: (committed) =>
              Transition.bufferCommitted(state, committed),
          }),
        ),
      SocketClosed: () => Effect.fail(new Errors.SocketClosedError()),
      SocketOpened: () =>
        Effect.fail(
          new Errors.DuplicateConnectError({
            stateTag: state._tag,
          }),
        ),
    }),
  );
}
