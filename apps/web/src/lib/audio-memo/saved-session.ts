import { Data, Effect, FiberHandle, Match, Stream, SubscriptionRef } from "effect";
import { DB } from "@manotes/shared/db.service";
import { GraphWorkerClient } from "../graph-worker.client";
import { AudioMemoService } from "./service";

export type Action = Data.TaggedEnum<{
  Idle: {};
  Retrying: {};
  Removing: {};
  RetryFailed: {};
  RemoveFailed: {};
}>;

export const Action = Data.taggedEnum<Action>();

export type Session = {
  changes: Stream.Stream<Action>;
  retry: Effect.Effect<void>;
  remove: Effect.Effect<void>;
};

export const make = Effect.fn("AudioMemoSavedSession.make")(function* (path: string) {
  const services = yield* Effect.context<DB.Service | GraphWorkerClient.Service>();
  const ref = yield* SubscriptionRef.make<Action>(Action.Idle());
  const handle = yield* FiberHandle.make<void, never>();

  const retry = Effect.fn("AudioMemoSavedSession.retry")(function* () {
    const action = yield* SubscriptionRef.get(ref);

    if (!canAct(action)) return;

    yield* SubscriptionRef.set(ref, Action.Retrying());
    yield* AudioMemoService.retry(path).pipe(
      Effect.andThen(SubscriptionRef.set(ref, Action.Idle())),
      Effect.catch(() => SubscriptionRef.set(ref, Action.RetryFailed())),
    );
  });

  const remove = Effect.fn("AudioMemoSavedSession.remove")(function* () {
    const action = yield* SubscriptionRef.get(ref);

    if (!canAct(action)) return;

    yield* SubscriptionRef.set(ref, Action.Removing());
    const { client } = yield* GraphWorkerClient.Service;

    // The list can unmount this row as soon as the DB changes. Let its accepted
    // removal finish even when that closes the session's FiberHandle.
    yield* client.removeAudioMemo({ path }).pipe(
      Effect.catch(() => SubscriptionRef.set(ref, Action.RemoveFailed())),
      Effect.uninterruptible,
    );
  });

  const run = Effect.fn("AudioMemoSavedSession.run")(function* (
    action: Effect.Effect<void, never, DB.Service | GraphWorkerClient.Service>,
  ) {
    yield* FiberHandle.run(handle, action, { onlyIfMissing: true });
  }, Effect.provideContext(services));

  return {
    changes: SubscriptionRef.changes(ref),
    retry: run(retry()),
    remove: run(remove()),
  } satisfies Session;
});

export const canAct = Match.type<Action>().pipe(
  Match.tag("Idle", "RetryFailed", "RemoveFailed", () => true),
  Match.orElse(() => false),
);

export * as AudioMemoSavedSession from "./saved-session";
