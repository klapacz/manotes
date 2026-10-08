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
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { DB } from "@manotes/shared/db.service";
import { GraphWorkerClient } from "../graph-worker.client";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { AudioMemoFiles } from "./files";
import type { AudioMemoIntent } from "./intent";
import { AudioMemoRecorder } from "./recorder";
import { AudioMemoRepo } from "./repo";
import { AudioMemoService } from "./service";

export type Draft = {
  id: RecordSchema.Id;
  createdAt: DateTime.Utc;
  intent: AudioMemoIntent.Record;
};

export type RecordingMetadata = AudioMemoRecorder.RecordingMetadata;

export type Capture = {
  blob: Blob;
  recording: RecordingMetadata;
};

type LocalState = Data.TaggedEnum<{
  Starting: {};
  StartFailed: {};
  Recording: { recorder: AudioMemoRecorder.Handle; elapsedSeconds: number };
  Saving: { capture: Capture };
  SaveFailed: { capture: Capture };
  Saved: { path: string };
  Retrying: { path: string };
  RetryFailed: { path: string };
  Removing: { path: string };
  RemoveFailed: { path: string };
  Closed: {};
}>;

const LocalState = Data.taggedEnum<LocalState>();

export type State = Data.TaggedEnum<{
  Starting: {};
  StartFailed: {};
  Recording: { recorder: AudioMemoRecorder.Handle; elapsedSeconds: number };
  Saving: { capture: Capture };
  SaveFailed: { capture: Capture };
  Pending: { recording: AudioMemoRepo.Record };
  Retrying: { recording: AudioMemoRepo.Record };
  RetryFailed: { recording: AudioMemoRepo.Record };
  TranscriptionFailed: { recording: AudioMemoRepo.Record };
  Removing: { recording: AudioMemoRepo.Record };
  RemoveFailed: { recording: AudioMemoRepo.Record };
  LoadFailed: { path: string };
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
  const ref = yield* SubscriptionRef.make<LocalState>(LocalState.Starting());
  const queryRefresh = yield* SubscriptionRef.make(0);
  // Keep the waveform until the row unmounts. Register its scope first so
  // the later stop-and-save finalizer finishes before the recorder is released.
  const recorderScope = yield* Scope.fork(yield* Effect.scope);
  const handle = yield* FiberHandle.make<void, never>();

  const changes = SubscriptionRef.changes(ref).pipe(
    Stream.zipLatestWith(SubscriptionRef.changes(queryRefresh), (local) => local),
    Stream.switchMap(
      Match.type<LocalState>().pipe(
        Match.tag("Saved", "Retrying", "RetryFailed", "Removing", "RemoveFailed", (local) => {
          return AudioMemoRepo.listReactive({ path: local.path }, "asc").pipe(
            Stream.map((rows): State => {
              const recording = rows[0];

              if (!recording) return State.Closed();

              // Completion precedes materialization. The pane's existing record
              // watcher replaces or clears the draft when its transcript exists.
              if (recording.state === "completed") return State.Pending({ recording });

              return Match.value(local).pipe(
                Match.tagsExhaustive({
                  Saved: () => {
                    return recording.state === "error"
                      ? State.TranscriptionFailed({ recording })
                      : State.Pending({ recording });
                  },
                  Retrying: () => State.Retrying({ recording }),
                  RetryFailed: () => State.RetryFailed({ recording }),
                  Removing: () => State.Removing({ recording }),
                  RemoveFailed: () => State.RemoveFailed({ recording }),
                }),
              );
            }),
            Stream.catch(() => Stream.succeed(State.LoadFailed({ path: local.path }))),
          );
        }),
        Match.orElse((local) => Stream.succeed<State>(local)),
      ),
    ),
    Stream.provideContext(services),
  );

  const record = Effect.fn("AudioMemoSession.record")(
    function* () {
      const events = yield* Queue.make<RecorderEvent, Cause.Done>();

      // Native callbacks enqueue events; this job consumes them in order without
      // spawning a fiber for every progress update or the final captured blob.
      const recorder = yield* Effect.acquireRelease(
        Effect.tryPromise(() => {
          return AudioMemoRecorder.start(
            element,
            (blob, recording) => {
              Queue.offerUnsafe(events, RecorderEvent.Stopped({ capture: { blob, recording } }));
              Queue.endUnsafe(events);
            },
            (ms) => {
              return Queue.offerUnsafe(
                events,
                RecorderEvent.Progress({ elapsedSeconds: Math.floor(ms / 1000) }),
              );
            },
          );
        }),
        (recorder) => Effect.sync(() => recorder.cancel()),
      ).pipe(Scope.provide(recorderScope));

      const started = yield* SubscriptionRef.modify(
        ref,
        Match.type<LocalState>().pipe(
          Match.tag("Starting", () => {
            return Step.go(LocalState.Recording({ recorder, elapsedSeconds: 0 }));
          }),
          Match.orElse(Step.stay),
        ),
      );

      if (!started) return;

      const captured = yield* Stream.fromQueue(events).pipe(
        Stream.filterMapEffect(
          Match.type<RecorderEvent>().pipe(
            Match.tagsExhaustive({
              Progress: ({ elapsedSeconds }) => {
                return SubscriptionRef.update(
                  ref,
                  Match.type<LocalState>().pipe(
                    Match.tag("Recording", ({ recorder }) => {
                      return LocalState.Recording({ recorder, elapsedSeconds });
                    }),
                    Match.orElse((state) => state),
                  ),
                ).pipe(Effect.as(Result.failVoid));
              },
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
          Match.type<LocalState>().pipe(
            Match.tag("Recording", () => Step.go(LocalState.Saving({ capture }))),
            Match.orElse(Step.stay),
          ),
        );

        if (!saving) return;

        yield* AudioMemoFiles.save(localGraphId, capture.recording.path, capture.blob);
        yield* AudioMemoService.register({
          ...capture.recording,
          recordId: draft.id,
          intent: draft.intent,
        });
        yield* SubscriptionRef.set(ref, LocalState.Saved({ path: capture.recording.path }));
      }).pipe(
        Effect.catch(() => SubscriptionRef.set(ref, LocalState.SaveFailed({ capture }))),
        // Finish writing both the file and intent if the row unmounts after Stop.
        Effect.uninterruptible,
      );
    },
    (effect) => {
      return effect.pipe(
        Effect.catch(() => {
          return SubscriptionRef.update(
            ref,
            Match.type<LocalState>().pipe(
              Match.tag("Starting", () => LocalState.StartFailed()),
              Match.orElse((state) => state),
            ),
          );
        }),
      );
    },
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
      Match.type<LocalState>().pipe(
        Match.tag("Starting", "StartFailed", "Recording", "SaveFailed", () => {
          return Step.go(LocalState.Closed());
        }),
        Match.orElse(Step.stay),
      ),
    );

    if (!closed) return;

    // Closing the row releases the recorder's scope. Unsaved captures are discarded.
    yield* FiberHandle.clear(handle);
  });

  const remove = Effect.fn("AudioMemoSession.remove")(function* () {
    const state = yield* SubscriptionRef.get(ref);

    const local = Match.value(state).pipe(
      Match.tag("Saved", "RetryFailed", "RemoveFailed", (local) => local),
      Match.orElse(() => undefined),
    );

    if (!local) return;

    yield* Effect.gen(function* () {
      const recording = yield* AudioMemoRepo.get(local.path);

      if (recording.state === "completed") return;

      // We continue with removal when transcription has failed or a previous removal attempt needs retrying.
      if (recording.state !== "error" && !LocalState.$is("RemoveFailed")(local)) return;

      yield* SubscriptionRef.set(ref, LocalState.Removing({ path: local.path }));
      const { client } = yield* GraphWorkerClient.Service;
      yield* client.removeAudioMemo({ path: local.path });
      yield* SubscriptionRef.set(ref, LocalState.Closed());
    }).pipe(
      Effect.catchTag("DB.NotFoundError", () => SubscriptionRef.set(ref, LocalState.Closed())),
      Effect.catch(() => SubscriptionRef.set(ref, LocalState.RemoveFailed({ path: local.path }))),
      // Deleting the row can unmount it before the worker call returns.
      Effect.uninterruptible,
    );
  });

  const retry = Effect.fn("AudioMemoSession.retry")(function* () {
    const state = yield* SubscriptionRef.get(ref);

    return yield* Match.value(state).pipe(
      Match.tag("RemoveFailed", () => remove()),
      Match.tag("Saved", "RetryFailed", ({ path }) => {
        return Effect.gen(function* () {
          const recording = yield* AudioMemoRepo.get(path);

          if (recording.state !== "error") return;

          yield* SubscriptionRef.set(ref, LocalState.Retrying({ path }));
          yield* AudioMemoService.retry(path);
          yield* SubscriptionRef.set(ref, LocalState.Saved({ path }));
        }).pipe(
          Effect.catchTag("DB.NotFoundError", () => SubscriptionRef.set(ref, LocalState.Closed())),
          Effect.catch(() => SubscriptionRef.set(ref, LocalState.RetryFailed({ path }))),
        );
      }),
      Match.orElse(() => Effect.void),
    );
  });

  // Guards run inside the accepted action, so extra clicks cannot replace active work.
  const run = Effect.fn("AudioMemoSession.run")(function* (
    action: Effect.Effect<void, never, DB.Service | GraphWorkerClient.Service | Scope.Scope>,
  ) {
    yield* FiberHandle.run(handle, action, { onlyIfMissing: true });
  }, Effect.provideContext(services));

  yield* run(record());

  yield* Effect.addFinalizer(() => {
    return Effect.gen(function* () {
      const state = yield* SubscriptionRef.get(ref);

      return yield* Match.value(state).pipe(
        Match.tag("Recording", ({ recorder }) => {
          return Effect.sync(() => recorder.stop()).pipe(
            Effect.andThen(FiberHandle.awaitEmpty(handle)),
          );
        }),
        Match.tag("Saving", () => FiberHandle.awaitEmpty(handle)),
        Match.orElse(() => Effect.void),
      );
    });
  });

  return {
    changes,
    stop: stop(),
    cancel: cancel(),
    reload: run(SubscriptionRef.update(queryRefresh, (version) => version + 1)),
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
  stay: (state: LocalState) => [false, state] as const,
  go: (state: LocalState) => [true, state] as const,
};

export * as AudioMemoSession from "./session";
