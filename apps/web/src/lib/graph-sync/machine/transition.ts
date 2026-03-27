/**
 * Builds next-state transitions after machine commands complete.
 */
import { Effect, Match, Types } from "effect";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";
import * as Model from "./model";
import * as Commands from "./commands";

export const stayInState = <TState extends Model.State>(state: TState) => Effect.as<TState>(state);

export function bufferCommitted(
  state: Types.ExtractTag<Model.State, "Bootstrapping" | "Committing">,
  committed: Messages.Committed,
) {
  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Bootstrapping: ({ bufferedCommitted }) =>
        Effect.succeed(
          Model.State.Bootstrapping({
            bufferedCommitted: [...bufferedCommitted, committed],
          }),
        ),
      Committing: ({ bufferedCommitted }) =>
        Effect.succeed(
          Model.State.Committing({
            bufferedCommitted: [...bufferedCommitted, committed],
          }),
        ),
    }),
  );
}

/**
 * Transitions to `Committing` only when a fresh pending batch is still present.
 *
 * This keeps sqlite notifications edge-triggered: missed wake-ups merely delay
 * sending because the database remains the source of truth.
 */
export const readyOrCommitPending = Effect.fn("GraphSyncMachineTransition.readyOrCommitPending")(
  function* () {
    const { didSendCommit } = yield* Commands.sendPendingCommit();

    if (didSendCommit) {
      return Model.State.Committing({
        bufferedCommitted: [],
      });
    }

    return Model.State.Ready();
  },
);
