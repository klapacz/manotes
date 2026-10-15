/**
 * Runs the graph sync state machine over queued session inputs.
 */
import { Effect, Match, Queue, Stream, SubscriptionRef } from "effect";
import { encodeClientMessage } from "../contract/codec";
import { GraphSyncStatus } from "../status";
import { MachineContext } from "./context";
import { GraphSyncModel } from "./model";
import { GraphSyncMachineErrors } from "./errors";
import { GraphSyncMachineStateHandlers } from "./state-handlers";
import { SyncStatusCloud } from "../status.schema";

export const run = Effect.fn("GraphSyncMachineRunner.run")(function* ({
  inputQueue,
  write,
}: {
  inputQueue: Queue.Dequeue<GraphSyncModel.Input, GraphSyncMachineErrors.RunnerQueueErrors>;
  write: GraphSyncModel.Write;
}) {
  const status = yield* GraphSyncStatus.Ref;

  return yield* Stream.fromQueue(inputQueue).pipe(
    Stream.runFoldEffect(
      (): GraphSyncModel.State => GraphSyncModel.State.Bootstrapping({ bufferedCommitted: [] }),
      Effect.fn(function* (currentState, signal) {
        yield* Effect.logDebug("Received Message", { currentState, signal });
        const nextState = yield* step(currentState, signal);

        yield* SubscriptionRef.update(status, (prev) => {
          return new SyncStatusCloud({
            mode: prev.mode,
            hasPending: prev.hasPending,
            syncState: nextState._tag,
          });
        });

        return nextState;
      }),
    ),
    Effect.provideService(MachineContext.GraphSyncMachineContext, {
      write: (message) => encodeClientMessage(message).pipe(Effect.andThen(write)),
    }),
  );
});

function step(currentState: GraphSyncModel.State, input: GraphSyncModel.Input) {
  return Match.value(currentState).pipe(
    Match.tagsExhaustive({
      Bootstrapping: (state) => GraphSyncMachineStateHandlers.bootstrapping(state, input),
      Ready: (state) => GraphSyncMachineStateHandlers.ready(state, input),
      Committing: (state) => GraphSyncMachineStateHandlers.committing(state, input),
    }),
  );
}

export * as GraphSyncMachineRunner from "./runner";
