/**
 * Runs the graph sync state machine over queued session inputs.
 */
import { Effect, Match, Queue, Stream, SubscriptionRef } from "effect";
import { encodeClientMessage } from "@manotes/shared/graph-sync/contract/codec";
import * as Status from "../status";
import * as MachineContext from "./context";
import * as Model from "./model";
import * as Errors from "./errors";
import * as StateHandlers from "./state-handlers";
import { SyncStatusCloud } from "../../graph.worker-rpc";

export const run = Effect.fn("GraphSyncMachineRunner.run")(function* ({
  inputQueue,
  write,
}: {
  inputQueue: Queue.Dequeue<Model.Input, Errors.RunnerQueueErrors>;
  write: Model.Write;
}) {
  const status = yield* Status.Ref;

  return yield* Stream.fromQueue(inputQueue).pipe(
    Stream.runFoldEffect(
      (): Model.State => Model.State.Bootstrapping({ bufferedCommitted: [] }),
      Effect.fn(function* (currentState, signal) {
        yield* Effect.logDebug("Received Message", { currentState, signal });
        const nextState = yield* step(currentState, signal);

        yield* SubscriptionRef.update(
          status,
          (prev) =>
            new SyncStatusCloud({
              mode: prev.mode,
              hasPending: prev.hasPending,
              syncState: nextState._tag,
            }),
        );

        return nextState;
      }),
    ),
    Effect.provideService(MachineContext.GraphSyncMachineContext, {
      write: (message) => encodeClientMessage(message).pipe(Effect.andThen(write)),
    }),
  );
});

function step(currentState: Model.State, input: Model.Input) {
  return Match.value(currentState).pipe(
    Match.tagsExhaustive({
      Bootstrapping: (state) => StateHandlers.bootstrapping(state, input),
      Ready: (state) => StateHandlers.ready(state, input),
      Committing: (state) => StateHandlers.committing(state, input),
    }),
  );
}
