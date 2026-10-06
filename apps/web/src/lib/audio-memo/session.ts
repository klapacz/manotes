import {
  type Cause,
  Data,
  DateTime,
  Effect,
  FiberHandle,
  Match,
  Option,
  Queue,
  Result,
  type Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { DB } from "../db.service";
import { GraphWorkerClient } from "../graph-worker.client";
import type { NoteSchema } from "../note.schema";
import { AudioMemoFiles } from "./files";
import type { AudioMemoIntent } from "./intent";
import { AudioMemoRecorder } from "./recorder";
import { AudioMemoRepo } from "./repo";
import { AudioMemoService } from "./service";

export type Draft = {
  id: NoteSchema.Id;
  createdAt: DateTime.Utc;
  intent: AudioMemoIntent.Record;
};

export type RecordingMetadata = AudioMemoRecorder.RecordingMetadata;

export type Capture = {
  blob: Blob;
  recording: RecordingMetadata;
};

export type State = Data.TaggedEnum<{
  Starting: {};
  StartFailed: {};
  Recording: { recorder: AudioMemoRecorder.Handle; elapsedSeconds: number };
  Saving: { capture: Capture };
  SaveFailed: { capture: Capture };
  Pending: { recording: RecordingMetadata };
  Retrying: { recording: RecordingMetadata };
  TranscriptionFailed: { recording: RecordingMetadata };
  Removing: { recording: RecordingMetadata };
  RemoveFailed: { recording: RecordingMetadata };
  Closed: {};
}>;

export const State = Data.taggedEnum<State>();

export const hasUnsavedAudio = Match.type<State>().pipe(
  Match.tag("Recording", "Saving", "SaveFailed", () => true),
  Match.orElse(() => false),
);

export const make = Effect.fn("AudioMemoSession.make")(function* (
  element: HTMLElement,
  draft: Draft,
) {
  const services = yield* Effect.context<DB.Service | GraphWorkerClient.Service | Scope.Scope>();
  const { localGraphId } = yield* DB.Config;
  const ref = yield* SubscriptionRef.make<State>(State.Starting());
  const handle = yield* FiberHandle.make<void, never>();

  const transcriptionFailed = SubscriptionRef.update(
    ref,
    Match.type<State>().pipe(
      Match.tag("Pending", ({ recording }) => State.TranscriptionFailed({ recording })),
      Match.orElse((state) => state),
    ),
  );

  // Start one background watcher. Pending subscribes to its persisted recording;
  // leaving Pending cancels that subscription, and retrying starts a fresh one.
  yield* SubscriptionRef.changes(ref).pipe(
    Stream.map(
      Match.type<State>().pipe(
        Match.tag("Pending", ({ recording }) => recording),
        Match.orElse(() => undefined),
      ),
    ),
    Stream.changes,
    Stream.switchMap((recording) => {
      if (!recording) return Stream.empty;

      return AudioMemoRepo.listReactive({ path: recording.path }, "asc").pipe(
        Stream.mapEffect((rows) =>
          rows[0]?.state === "error" ? transcriptionFailed : Effect.void,
        ),
        Stream.catch(() => Stream.fromEffect(transcriptionFailed)),
      );
    }),
    Stream.runDrain,
    Effect.forkScoped,
  );

  const record = Effect.fn("AudioMemoSession.record")(
    function* () {
      const events = yield* Queue.make<RecorderEvent, Cause.Done>();

      // Native callbacks enqueue events; this job consumes them in order without
      // spawning a fiber for every progress update or the final captured blob.
      const recorder = yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          AudioMemoRecorder.start(
            element,
            (blob, recording) => {
              Queue.offerUnsafe(events, RecorderEvent.Stopped({ capture: { blob, recording } }));
              Queue.endUnsafe(events);
            },
            (ms) =>
              Queue.offerUnsafe(
                events,
                RecorderEvent.Progress({ elapsedSeconds: Math.floor(ms / 1000) }),
              ),
          ),
        ),
        (recorder) => Effect.sync(() => recorder.cancel()),
      );

      const started = yield* SubscriptionRef.modify(
        ref,
        Match.type<State>().pipe(
          Match.tag("Starting", () => Step.go(State.Recording({ recorder, elapsedSeconds: 0 }))),
          Match.orElse(Step.stay),
        ),
      );

      if (!started) return;

      const captured = yield* Stream.fromQueue(events).pipe(
        Stream.filterMapEffect(
          Match.type<RecorderEvent>().pipe(
            Match.tagsExhaustive({
              Progress: ({ elapsedSeconds }) =>
                SubscriptionRef.update(
                  ref,
                  Match.type<State>().pipe(
                    Match.tag("Recording", ({ recorder }) =>
                      State.Recording({ recorder, elapsedSeconds }),
                    ),
                    Match.orElse((state) => state),
                  ),
                ).pipe(Effect.as(Result.failVoid)),
              Stopped: ({ capture }) => Effect.succeed(Result.succeed(capture)),
            }),
          ),
        ),
        Stream.runHead,
      );

      if (Option.isNone(captured)) return;

      const capture = captured.value;

      yield* Effect.gen(function* () {
        // Claim Saving before writing, so Cancel cannot discard a capture being saved.
        const saving = yield* SubscriptionRef.modify(
          ref,
          Match.type<State>().pipe(
            Match.tag("Recording", () => Step.go(State.Saving({ capture }))),
            Match.orElse(Step.stay),
          ),
        );

        if (!saving) return;

        yield* AudioMemoFiles.save(localGraphId, capture.recording.path, capture.blob);
        yield* AudioMemoService.register({
          ...capture.recording,
          noteId: draft.id,
          intent: draft.intent,
        });
        yield* SubscriptionRef.set(ref, State.Pending({ recording: capture.recording }));
      }).pipe(
        Effect.catch(() => SubscriptionRef.set(ref, State.SaveFailed({ capture }))),
        // Finish writing both the file and intent if the row unmounts after Stop.
        Effect.uninterruptible,
      );
    },
    (effect) =>
      effect.pipe(
        Effect.catch(() =>
          SubscriptionRef.update(
            ref,
            Match.type<State>().pipe(
              Match.tag("Starting", () => State.StartFailed()),
              Match.orElse((state) => state),
            ),
          ),
        ),
      ),
  );

  const stop = Effect.fn("AudioMemoSession.stop")(function* () {
    const state = yield* SubscriptionRef.get(ref);

    // WaveSurfer ignores repeated stops. The existing job awaits the final blob.
    return yield* Match.value(state).pipe(
      Match.tag("Recording", ({ recorder }) => Effect.sync(() => recorder.stop())),
      Match.orElse(() => Effect.void),
    );
  });

  const cancel = Effect.fn("AudioMemoSession.cancel")(function* () {
    const closed = yield* SubscriptionRef.modify(
      ref,
      Match.type<State>().pipe(
        Match.tag("Starting", "StartFailed", "Recording", "SaveFailed", () =>
          Step.go(State.Closed()),
        ),
        Match.orElse(Step.stay),
      ),
    );

    if (!closed) return;

    // Closing the row releases the recorder's scope. Unsaved captures are discarded.
    yield* FiberHandle.clear(handle);
  });

  const remove = Effect.fn("AudioMemoSession.remove")(function* () {
    const state = yield* SubscriptionRef.get(ref);

    const recording = Match.value(state).pipe(
      Match.tag("TranscriptionFailed", "RemoveFailed", ({ recording }) => recording),
      Match.orElse(() => undefined),
    );

    if (!recording) return;

    yield* SubscriptionRef.set(ref, State.Removing({ recording }));
    yield* Effect.gen(function* () {
      const { client } = yield* GraphWorkerClient.Service;
      yield* client.removeAudioMemo({ path: recording.path });
      yield* SubscriptionRef.set(ref, State.Closed());
    }).pipe(Effect.catch(() => SubscriptionRef.set(ref, State.RemoveFailed({ recording }))));
  });

  const retry = Effect.fn("AudioMemoSession.retry")(function* () {
    const state = yield* SubscriptionRef.get(ref);

    return yield* Match.value(state).pipe(
      Match.tag("RemoveFailed", () => remove()),
      Match.tag("TranscriptionFailed", ({ recording }) =>
        Effect.gen(function* () {
          yield* SubscriptionRef.set(ref, State.Retrying({ recording }));
          yield* AudioMemoService.retry(recording.path);
          yield* SubscriptionRef.set(ref, State.Pending({ recording }));
        }).pipe(
          Effect.catch(() => SubscriptionRef.set(ref, State.TranscriptionFailed({ recording }))),
        ),
      ),
      Match.orElse(() => Effect.void),
    );
  });

  // Guards run inside the accepted action, so extra clicks cannot replace active work.
  const run = Effect.fn("AudioMemoSession.run")(function* (
    action: Effect.Effect<void, never, DB.Service | GraphWorkerClient.Service | Scope.Scope>,
  ) {
    yield* FiberHandle.run(handle, action, { onlyIfMissing: true });
  }, Effect.provideContext(services));

  // Keep recorder resources in the job's scope so they remain available while
  // the session's finalizer stops recording and waits for its save to finish.
  yield* run(Effect.scoped(record()));

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(ref);

      return yield* Match.value(state).pipe(
        Match.tag("Recording", ({ recorder }) =>
          Effect.sync(() => recorder.stop()).pipe(Effect.andThen(FiberHandle.awaitEmpty(handle))),
        ),
        Match.tag("Saving", () => FiberHandle.awaitEmpty(handle)),
        Match.orElse(() => Effect.void),
      );
    }),
  );

  return {
    changes: SubscriptionRef.changes(ref),
    stop: stop(),
    cancel: cancel(),
    retry: run(retry()),
    remove: run(remove()),
  };
});

type RecorderEvent = Data.TaggedEnum<{
  Progress: { elapsedSeconds: number };
  Stopped: { capture: Capture };
}>;

const RecorderEvent = Data.taggedEnum<RecorderEvent>();

const Step = {
  stay: (state: State) => [false, state] as const,
  go: (state: State) => [true, state] as const,
};

export * as AudioMemoSession from "./session";
