/**
 * Runs the graph sync state machine over queued session inputs.
 */
import { Effect, Match, Queue, Ref, Stream } from "effect";
import { encodeClientMessage } from "@manotes/shared/graph-sync/contract/codec";
import * as Status from "../status";
import * as MachineContext from "./context";
import * as Model from "./model";
import * as StateHandlers from "./state-handlers";
import { SyncStatusCloud } from "../../graph.worker-rpc";

export const run = Effect.fn("GraphSyncMachineRunner.run")(function* ({
  inputQueue,
  write,
}: {
  inputQueue: Queue.Dequeue<Model.Input>;
  write: Model.Write;
}) {
  const status = yield* Status.Ref;

  // `runFoldEffect` infers the accumulator from the initial value here, so
  // without widening it, TypeScript locks the fold state to `Bootstrapping`
  // and rejects the `Ready` / `Committing` transitions.
  const initialState = Model.State.Bootstrapping({
    bufferedCommitted: [],
  }) as Model.State;

  return yield* Stream.fromQueue(inputQueue).pipe(
    Stream.runFoldEffect(
      initialState,
      Effect.fn(function* (currentState, signal) {
        yield* Effect.logDebug("Received Message", { currentState, signal });
        const nextState = yield* step(currentState, signal);

        yield* Ref.update(
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
