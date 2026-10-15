/**
 * Builds next-state transitions after machine commands complete.
 */
import { Effect, Match, Types } from "effect";
import { GraphSyncMessages } from "../contract/messages";
import { GraphSyncModel } from "./model";
import { GraphSyncMachineCommands } from "./commands";

export const stayInState = <TState extends GraphSyncModel.State>(state: TState) => {
  return Effect.as<TState>(state);
};

export function bufferCommitted(
  state: Types.ExtractTag<GraphSyncModel.State, "Bootstrapping" | "Committing">,
  committed: GraphSyncMessages.Committed,
) {
  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Bootstrapping: ({ bufferedCommitted }) => {
        return Effect.succeed(
          GraphSyncModel.State.Bootstrapping({
            bufferedCommitted: [...bufferedCommitted, committed],
          }),
        );
      },
      Committing: ({ bufferedCommitted }) => {
        return Effect.succeed(
          GraphSyncModel.State.Committing({
            bufferedCommitted: [...bufferedCommitted, committed],
          }),
        );
      },
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
    const { didSendCommit } = yield* GraphSyncMachineCommands.sendPendingCommit();

    if (didSendCommit) {
      return GraphSyncModel.State.Committing({
        bufferedCommitted: [],
      });
    }

    return GraphSyncModel.State.Ready();
  },
);

export * as GraphSyncMachineTransition from "./transition";
