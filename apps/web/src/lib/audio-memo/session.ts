import {
  Data,
  DateTime,
  Effect,
  Fiber,
  FiberHandle,
  Match,
  Option,
  Predicate,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { AsyncResult } from "effect/reactivity";
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

export type Phase = Data.TaggedEnum<{
  Recording: { recorder: AudioMemoRecorder.Handle; elapsedSeconds: number };
  Captured: { capture: AudioMemoRecorder.Capture };
  Saved: { recording: AudioMemoRepo.Record };
  Closed: {};
}>;

export const Phase = Data.taggedEnum<Phase>();

export class SessionError extends Data.TaggedError("AudioMemoSessionError")<{
  operation: "start" | "save" | "load" | "retry" | "remove";
  cause: unknown;
}> {}

// The result holds the phase, whether work is running, and any error with its last value.
export type Result = AsyncResult.AsyncResult<Phase, SessionError>;

// Query status carries DB rows, not execution phases or command errors.
type DatabaseStream = ReturnType<typeof AudioMemoRepo.listReactive>;

type DatabaseResult = AsyncResult.AsyncResult<
  Stream.Success<DatabaseStream>,
  Stream.Error<DatabaseStream>
>;

export type Command = Data.TaggedEnum<{
  stop: {};
  reload: {};
  retry: {};
  remove: {};
  cancel: {};
}>;

export const Command = Data.taggedEnum<Command>();

type Input = Data.TaggedEnum<{
  Command: { command: Command };
  Event: { event: AudioMemoRecorder.Event };
}>;

const Input = Data.taggedEnum<Input>();

export const make = Effect.fn("AudioMemoSession.make")(function* (
  element: HTMLElement,
  draft: Draft,
) {
  const services = yield* Effect.context<DB.Service | GraphWorkerClient.Service | Scope.Scope>();
  const { localGraphId } = yield* DB.Config;
  const ref = yield* SubscriptionRef.make<Result>(AsyncResult.initial(true));
  const reload = yield* SubscriptionRef.make(0);
  // Keep the waveform alive until stop-and-save cleanup has finished.
  const recorderScope = yield* Scope.fork(yield* Effect.scope);
  // Own one saved-recording job at a time and finish it before releasing the waveform.
  const jobs = yield* FiberHandle.make<void, never>();

  // Show waiting, run the job, then return its result. Failures keep the previous phase.
  const attempt = Effect.fn("AudioMemoSession.attempt")(function* (
    operation: SessionError["operation"],
    previous: Result,
    job: Effect.Effect<Phase, unknown, DB.Service | GraphWorkerClient.Service | Scope.Scope>,
  ) {
    // Saving and cancellation claim the state under the same ref lock.
    const waiting = yield* SubscriptionRef.updateAndGet(ref, (current) => {
      if (Predicate.isTagged(value(current), "Closed")) return current;

      return AsyncResult.waiting(previous);
    });

    if (Predicate.isTagged(value(waiting), "Closed")) return waiting;

    const exit = yield* Effect.exit(
      job.pipe(Effect.catchCause((cause) => Effect.fail(new SessionError({ operation, cause })))),
    );

    return AsyncResult.fromExitWithPrevious(exit, Option.some(waiting));
  });

  // Choose the current phase first, then handle the inputs accepted in that phase.
  const step = Effect.fn("AudioMemoSession.step")(function* (previous: Result, input: Input) {
    const stay = Effect.succeed(previous);

    return yield* Match.value(value(previous)).pipe(
      // Before capture starts, we can accept the recorder handle or cancel startup.
      Match.when(undefined, () => {
        return Match.value(input).pipe(
          Match.when(
            { _tag: "Event", event: AudioMemoRecorder.Event.$is("Started") },
            ({ event }) => {
              return Effect.succeed(
                AsyncResult.success(
                  Phase.Recording({ recorder: event.recorder, elapsedSeconds: 0 }),
                ),
              );
            },
          ),
          Match.when({ _tag: "Command", command: Command.$is("cancel") }, () => {
            return Effect.succeed(AsyncResult.success(Phase.Closed()));
          }),
          Match.orElse(() => stay),
        );
      }),

      Match.tag("Recording", (phase) => {
        return Match.value(input).pipe(
          Match.when(
            { _tag: "Event", event: AudioMemoRecorder.Event.$is("Progress") },
            ({ event }) => {
              return Effect.succeed(
                AsyncResult.map(previous, () => {
                  return Phase.Recording({ ...phase, elapsedSeconds: event.elapsedSeconds });
                }),
              );
            },
          ),
          Match.when(
            { _tag: "Event", event: AudioMemoRecorder.Event.$is("Captured") },
            ({ event: { capture } }) => {
              return (
                // Keep the captured audio if saving fails. Watch the DB after registration.
                attempt(
                  "save",
                  AsyncResult.success(Phase.Captured({ capture })),
                  Effect.gen(function* () {
                    const recording = {
                      ...capture.recording,
                      recordId: draft.id,
                      intent: draft.intent,
                      state: "pending" as const,
                    };

                    yield* AudioMemoFiles.save(localGraphId, recording.path, capture.blob);
                    yield* AudioMemoService.register(recording);

                    return Phase.Saved({ recording });
                  }),
                )
              );
            },
          ),
          // Stop requests the final blob. The Captured event starts saving.
          Match.when({ _tag: "Command", command: Command.$is("stop") }, () => {
            return Effect.sync(() => {
              phase.recorder.stop();

              return previous;
            });
          }),
          Match.when({ _tag: "Command", command: Command.$is("cancel") }, () => {
            return Effect.succeed(AsyncResult.success(Phase.Closed()));
          }),
          Match.orElse(() => stay),
        );
      }),

      // Finish an accepted save. A failed save keeps its capture until the user discards it.
      Match.tag("Captured", () => {
        if (previous.waiting) return stay;

        return Match.value(input).pipe(
          Match.when({ _tag: "Command", command: Command.$is("cancel") }, () => {
            return Effect.succeed(AsyncResult.success(Phase.Closed()));
          }),
          Match.orElse(() => stay),
        );
      }),

      Match.tag("Saved", (phase) => {
        return Match.value(input).pipe(
          // Reload restarts the query without changing the local phase.
          Match.when({ _tag: "Command", command: Command.$is("reload") }, () => {
            return Effect.gen(function* () {
              yield* SubscriptionRef.update(reload, (version) => version + 1);

              return previous;
            });
          }),
          Match.when({ _tag: "Command", command: Command.$is("retry") }, () => {
            return attempt(
              "retry",
              previous,
              Effect.gen(function* () {
                // Read the current row; another pane may have changed it.
                const recording = yield* AudioMemoRepo.get(phase.recording.path);

                if (recording.state !== "error") return phase;
                yield* AudioMemoService.retry(recording.path);

                return phase;
              }).pipe(Effect.catchTag("DB.NotFoundError", () => Effect.succeed(Phase.Closed()))),
            );
          }),
          Match.when({ _tag: "Command", command: Command.$is("remove") }, () => {
            return attempt(
              "remove",
              previous,
              Effect.gen(function* () {
                const recording = yield* AudioMemoRepo.get(phase.recording.path);

                if (recording.state === "completed") return phase;

                // We continue with removal when transcription has failed or a previous removal attempt needs retrying.
                if (recording.state !== "error" && error(previous)?.operation !== "remove") {
                  return phase;
                }

                const { client } = yield* GraphWorkerClient.Service;
                yield* client.removeAudioMemo({ path: recording.path });

                return Phase.Closed();
              }).pipe(Effect.catchTag("DB.NotFoundError", () => Effect.succeed(Phase.Closed()))),
            );
          }),
          Match.orElse(() => stay),
        );
      }),

      // Late events and commands cannot reopen a closed session.
      Match.tag("Closed", () => stay),
      Match.exhaustive,
    );
  });

  // Short transitions use the ref's own lock.
  const update = (input: Input) => {
    return SubscriptionRef.updateEffect(ref, (previous) => step(previous, input));
  };

  // I/O jobs publish waiting first, then commit their result without reopening a closed session.
  const execute = Effect.fn("AudioMemoSession.execute")(function* (input: Input) {
    const previous = yield* SubscriptionRef.get(ref);
    const next = yield* step(previous, input);

    if (next === previous) return;

    yield* SubscriptionRef.update(ref, (current) => {
      if (Predicate.isTagged(value(current), "Closed")) return current;

      return next;
    });
  });

  // Recorder events arrive in order. A final capture always gets processed and saved.
  const captureFiber = yield* AudioMemoRecorder.events(element).pipe(
    Scope.provide(recorderScope),
    Stream.unwrap,
    Stream.runForEach((event) => {
      return Match.value(event).pipe(
        Match.tag("Started", "Progress", () => update(Input.Event({ event }))),
        Match.tag("Captured", () => execute(Input.Event({ event }))),
        Match.exhaustive,
        Effect.uninterruptible,
      );
    }),
    Effect.catch((cause) => {
      return SubscriptionRef.update(ref, (previous) => {
        if (Predicate.isTagged(value(previous), "Closed")) return previous;

        return AsyncResult.fail(new SessionError({ operation: "start", cause }));
      });
    }),
    Effect.forkScoped,
  );

  // Accepted commands finish even if the component unmounts.
  const run = Effect.fn("AudioMemoSession.run")(
    function* (command: Command) {
      const input = Input.Command({ command });

      yield* Match.value(command).pipe(
        // The handle ignores another retry/removal while the current job runs.
        Match.tag("retry", "remove", () => {
          return Effect.gen(function* () {
            const fiber = yield* FiberHandle.run(
              jobs,
              execute(input).pipe(Effect.uninterruptible),
              {
                onlyIfMissing: true,
              },
            );

            // An ignored click returns an interrupted fiber; awaiting it keeps the click harmless.
            yield* Fiber.await(fiber);
          });
        }),
        // Recorder controls and reloads only make short, atomic state updates.
        Match.tag("stop", "cancel", "reload", () => update(input)),
        Match.exhaustive,
      );
    },
    Effect.uninterruptible,
    Effect.provideContext(services),
  );

  // Query rows independently of execution. Only path changes and reloads restart the query.
  const database = SubscriptionRef.changes(ref).pipe(
    Stream.map((current) => {
      const phase = value(current);

      if (Predicate.isTagged(phase, "Saved")) return phase.recording.path;

      return undefined;
    }),
    Stream.changes,
    Stream.zipLatestWith(SubscriptionRef.changes(reload), (path) => path),
    Stream.switchMap((path) => {
      if (path === undefined) return Stream.succeed<DatabaseResult>(AsyncResult.initial());

      return AudioMemoRepo.listReactive({ path }, "asc").pipe(
        Stream.map((rows): DatabaseResult => AsyncResult.success(rows)),
        Stream.catch((cause) => Stream.succeed<DatabaseResult>(AsyncResult.fail(cause))),
        Stream.prepend([AsyncResult.initial(true)]),
      );
    }),
    // Keep the last DB rows while reloading or after a query failure.
    Stream.scan<DatabaseResult, DatabaseResult>(
      () => AsyncResult.initial(),
      (previous, current) => {
        if (AsyncResult.isInitial(current) && current.waiting) return AsyncResult.waiting(previous);

        return AsyncResult.replacePrevious(current, Option.some(previous));
      },
    ),
  );

  // On unmount, stop active recording and finish saving before releasing the waveform.
  yield* Effect.addFinalizer(() => {
    return Effect.gen(function* () {
      const current = yield* SubscriptionRef.get(ref);
      const phase = value(current);

      if (Predicate.isTagged(phase, "Recording")) yield* Effect.sync(() => phase.recorder.stop());

      if (
        Predicate.isTagged(phase, "Recording") ||
        (Predicate.isTagged(phase, "Captured") && current.waiting)
      ) {
        yield* Fiber.await(captureFiber);
      }
    });
  });

  return {
    changes: Stream.zipLatestWith(SubscriptionRef.changes(ref), database, derive).pipe(
      Stream.provideContext(services),
    ),
    run,
  };
});

// Turn query rows into a session phase, then combine that phase with execution progress/errors.
// DB updates stay visible while saved-recording jobs run.
function derive(local: Result, database: DatabaseResult): Result {
  const localPhase = value(local);

  // Before registration, only execution knows about the capture.
  if (!Predicate.isTagged(localPhase, "Saved")) return local;

  const databasePhase = AsyncResult.map(database, ([recording]) => {
    if (!recording) return Phase.Closed();

    return Phase.Saved({ recording });
  });

  return AsyncResult.match(databasePhase, {
    onInitial: () => AsyncResult.waiting(local),

    // Query failures become session load errors while keeping the last known recording.
    onFailure: (failure) => {
      const phase = AsyncResult.getOrElse(failure, () => localPhase);

      return AsyncResult.failWithPrevious(
        new SessionError({ operation: "load", cause: failure.cause }),
        {
          previous: Option.some(AsyncResult.success(phase)),
          waiting: local.waiting || failure.waiting,
        },
      );
    },

    onSuccess: ({ value: phase }) => {
      // A missing row closes immediately, even if a command is still running.
      if (Phase.$is("Closed")(phase)) return AsyncResult.success(phase);

      // Keep a completed recording visible until the pane finds its replacement record.
      if (phase.recording.state === "completed") {
        return AsyncResult.success(phase, { waiting: local.waiting });
      }

      // Refresh the recording data while keeping the command's waiting flag or error.
      return AsyncResult.map(local, () => phase);
    },
  });
}

// Read the current phase, or the retained phase after a failure.
export function value(result: Result) {
  return Option.getOrUndefined(AsyncResult.value(result));
}

export function error(result: Result) {
  return Option.getOrUndefined(AsyncResult.error(result));
}

export * as AudioMemoSession from "./session";
