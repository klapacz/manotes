import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Queue,
  Schema,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { RpcTest } from "effect/rpc";
import { AsyncResult } from "effect/reactivity";
import { DB } from "@manotes/shared/db.service";
import { RecordSchema } from "@manotes/shared/record.schema";
import { AudioMemoFiles } from "./files";
import { AudioMemoRecorder } from "./recorder";
import { AudioMemoRepo } from "./repo";
import { AudioMemoService } from "./service";
import { AudioMemoSession, Phase } from "./session";
import { GraphWorkerClient } from "../graph-worker.client";
import { GraphSharedWorkerRpc } from "../graph.worker-rpc";

afterEach(() => vi.restoreAllMocks());

it.each(["retry", "remove"] as const)(
  "preserves action state when reloading during %s",
  async (action) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const recordedAt = yield* DateTime.now;

        const recording: AudioMemoRepo.Record = {
          path: "memo.webm",
          recordedAt,
          mimeType: "audio/webm",
          durationMs: 1200,
          recordId: RecordSchema.Id.make("memo-note"),
          intent: { date: "2026-10-08", backlink: null },
          state: "pending",
        };

        const rows = yield* SubscriptionRef.make<AudioMemoRepo.Record[]>([]);
        const states = yield* Queue.make<AudioMemoSession.Result>();
        const actionStarted = yield* Deferred.make<void>();
        const finishAction = yield* Deferred.make<void>();
        const cancel = vi.fn();

        const queryError = yield* Schema.decodeUnknownEffect(Schema.String)(null).pipe(Effect.flip);

        let failQuery = false;

        mockRecorder({ ...recording, durationMs: 1200 }, cancel);
        vi.spyOn(AudioMemoFiles, "save").mockReturnValue(Effect.succeed(undefined));
        vi.spyOn(AudioMemoService, "register").mockImplementation(() => {
          return SubscriptionRef.set(rows, [recording]);
        });

        const listReactive = vi.spyOn(AudioMemoRepo, "listReactive").mockImplementation(() => {
          return SubscriptionRef.changes(rows).pipe(
            Stream.mapEffect((current) => {
              return failQuery ? Effect.fail(queryError) : Effect.succeed(current);
            }),
          );
        });

        const get = vi.spyOn(AudioMemoRepo, "get").mockImplementation(() => {
          return SubscriptionRef.get(rows).pipe(
            Effect.flatMap(([row]) => {
              return row ? Effect.succeed(row) : Effect.fail(new DB.NotFoundError());
            }),
          );
        });

        const waitForAction = Deferred.succeed(actionStarted, undefined).pipe(
          Effect.andThen(Deferred.await(finishAction)),
        );

        const retry = vi
          .spyOn(AudioMemoService, "retry")
          .mockReturnValueOnce(Effect.fail(queryError))
          .mockReturnValue(waitForAction);

        const remove = vi
          .fn<() => Effect.Effect<void, string>>()
          .mockReturnValueOnce(Effect.fail("Could not remove"))
          .mockReturnValue(waitForAction);

        const client = yield* makeClient(remove);

        // SAFETY: The stubbed recorder never reads the DOM element.
        const element = {} as HTMLElement;

        const session = yield* AudioMemoSession.make(element, {
          id: RecordSchema.Id.make(recording.recordId),
          createdAt: recordedAt,
          intent: recording.intent,
        }).pipe(
          Effect.provideService(GraphWorkerClient.Service, { client }),
          Effect.provideService(DB.Service, testDB),
          Effect.provideService(DB.Config, {
            localGraphId: "test-graph",
            databasePath: "test.db",
          }),
        );

        yield* Effect.addFinalizer(() => Deferred.succeed(finishAction, undefined));

        const next = (accept: (result: AudioMemoSession.Result) => boolean) => {
          return Stream.fromQueue(states).pipe(
            Stream.filter(accept),
            Stream.runHead,
            Effect.map(Option.getOrThrow),
          );
        };

        const nextPhase = (tag: AudioMemoSession.Phase["_tag"]) => {
          return next((result) => AudioMemoSession.value(result)?._tag === tag);
        };

        const nextError = (operation: AudioMemoSession.SessionError["operation"]) => {
          return next(
            (result) => !result.waiting && AudioMemoSession.error(result)?.operation === operation,
          );
        };

        yield* session.changes.pipe(
          Stream.runForEach((state) => Queue.offer(states, state)),
          Effect.forkScoped,
        );
        yield* nextPhase("Recording");
        yield* session.run(AudioMemoSession.Command.retry());
        yield* session.run(AudioMemoSession.Command.remove());
        expect(get).not.toHaveBeenCalled();
        yield* session.run(AudioMemoSession.Command.stop());
        yield* nextPhase("Saved");
        yield* session.run(AudioMemoSession.Command.cancel());
        const failed: AudioMemoRepo.Record = { ...recording, state: "error" };
        yield* SubscriptionRef.set(rows, [failed]);
        yield* next((result) => {
          const phase = AudioMemoSession.value(result);

          return phase?._tag === "Saved" && phase.recording.state === "error";
        });
        yield* session.run(AudioMemoSession.Command[action]());
        const actionFailure = yield* nextError(action);
        expect(AudioMemoSession.value(actionFailure)).toEqual(Phase.Saved({ recording: failed }));

        failQuery = true;
        yield* SubscriptionRef.set(rows, [failed]);
        yield* nextError("load");
        failQuery = false;
        yield* session.run(AudioMemoSession.Command.reload());
        const restoredFailure = yield* nextError(action);
        expect(AudioMemoSession.error(restoredFailure)).toBe(AudioMemoSession.error(actionFailure));
        expect(AudioMemoSession.value(restoredFailure)).toEqual(Phase.Saved({ recording: failed }));
        expect(action === "retry" ? retry : remove).toHaveBeenCalledTimes(1);

        const runningAction = yield* session
          .run(AudioMemoSession.Command[action]())
          .pipe(Effect.forkScoped);

        yield* Deferred.await(actionStarted);
        yield* next((result) => result.waiting);

        failQuery = true;
        yield* SubscriptionRef.set(rows, [failed]);
        yield* next(
          (result) => result.waiting && AudioMemoSession.error(result)?.operation === "load",
        );
        failQuery = false;
        yield* session.run(AudioMemoSession.Command.reload());

        const running = yield* next(
          (result) => result.waiting && AudioMemoSession.error(result)?.operation === action,
        );

        expect(AudioMemoSession.error(running)).toBe(AudioMemoSession.error(actionFailure));

        const retryCalls = retry.mock.calls.length;
        const removeCalls = remove.mock.calls.length;
        yield* session.run(
          action === "retry" ? AudioMemoSession.Command.remove() : AudioMemoSession.Command.retry(),
        );
        expect(retry).toHaveBeenCalledTimes(retryCalls);
        expect(remove).toHaveBeenCalledTimes(removeCalls);

        const completed: AudioMemoRepo.Record = { ...recording, state: "completed" };
        yield* SubscriptionRef.set(rows, [completed]);

        const completedResult = yield* next((result) => {
          const phase = AudioMemoSession.value(result);

          return phase?._tag === "Saved" && phase.recording.state === "completed";
        });

        expect(completedResult.waiting).toBe(true);
        expect(AsyncResult.isSuccess(completedResult)).toBe(true);
        expect(cancel).not.toHaveBeenCalled();

        yield* SubscriptionRef.set(rows, []);
        expect(AudioMemoSession.value(yield* nextPhase("Closed"))).toEqual(Phase.Closed());
        const subscriptionsBeforeFinish = listReactive.mock.calls.length;
        yield* Deferred.succeed(finishAction, undefined);
        yield* Fiber.join(runningAction);
        expect(AudioMemoSession.value(yield* nextPhase("Closed"))).toEqual(Phase.Closed());
        expect(listReactive).toHaveBeenCalledTimes(subscriptionsBeforeFinish);
      }).pipe(Effect.scoped),
    );
  },
);

it.each(["recording", "saving"] as const)(
  "finishes saving before releasing the recorder when closing during %s",
  async (stage) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const recordedAt = yield* DateTime.now;
        const recordId = RecordSchema.Id.make("closing-note");
        const intent = { date: "2026-10-09", backlink: null };

        const metadata: AudioMemoRecorder.RecordingMetadata = {
          path: "closing.webm",
          recordedAt,
          mimeType: "audio/webm",
          durationMs: 1200,
        };

        const saveStarted = yield* Deferred.make<void>();
        const finishSave = yield* Deferred.make<void>();
        const states = yield* Queue.make<AudioMemoSession.Result>();
        const order: string[] = [];
        const cancel = vi.fn(() => order.push("released"));
        const stop = mockRecorder(metadata, cancel);
        vi.spyOn(AudioMemoFiles, "save").mockReturnValue(
          Effect.sync(() => order.push("saving")).pipe(
            Effect.andThen(Deferred.succeed(saveStarted, undefined)),
            Effect.andThen(Deferred.await(finishSave)),
            Effect.as(undefined),
          ),
        );
        vi.spyOn(AudioMemoService, "register").mockImplementation(() => {
          return Effect.sync(() => {
            order.push("registered");
          });
        });
        vi.spyOn(AudioMemoRepo, "listReactive").mockReturnValue(Stream.never);
        const client = yield* makeClient(() => Effect.void);
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.succeed(undefined)));
        // Release the save gate before closing scope if an assertion fails.
        yield* Effect.addFinalizer(() => Deferred.succeed(finishSave, undefined));

        // SAFETY: The stubbed recorder never reads the DOM element.
        const element = {} as HTMLElement;

        const session = yield* AudioMemoSession.make(element, {
          id: recordId,
          createdAt: recordedAt,
          intent,
        }).pipe(
          Scope.provide(scope),
          Effect.provideService(DB.Config, { localGraphId: "test-graph", databasePath: "test.db" }),
          Effect.provideService(DB.Service, testDB),
          Effect.provideService(GraphWorkerClient.Service, { client }),
        );

        yield* session.changes.pipe(
          Stream.runForEach((state) => Queue.offer(states, state)),
          Effect.forkScoped,
        );
        yield* Stream.fromQueue(states).pipe(
          Stream.filter((result) => AudioMemoSession.value(result)?._tag === "Recording"),
          Stream.runHead,
        );

        if (stage === "saving") {
          yield* session.run(AudioMemoSession.Command.stop());
          yield* Deferred.await(saveStarted);
          yield* session.run(AudioMemoSession.Command.cancel());
        }

        const closing = yield* Scope.close(scope, Exit.succeed(undefined)).pipe(Effect.forkScoped);
        yield* Deferred.await(saveStarted);
        expect(cancel).not.toHaveBeenCalled();
        expect(order).toEqual(["saving"]);
        yield* Deferred.succeed(finishSave, undefined);
        yield* Fiber.join(closing);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(order).toEqual(["saving", "registered", "released"]);
      }).pipe(Effect.scoped),
    );
  },
);

const testDB = DB.Service.of({
  query: () => Effect.die("Unexpected query"),
  execute: () => Effect.die("Unexpected execute"),
  jsonArrayFrom: () => {
    throw new Error("Unexpected jsonArrayFrom");
  },
  jsonObjectFrom: () => {
    throw new Error("Unexpected jsonObjectFrom");
  },
  find: () => Effect.die("Unexpected find"),
  reactiveQuery: () => Effect.die("Unexpected reactive query"),
  transaction: (effect) => effect,
});

function makeClient(remove: () => Effect.Effect<void, string>) {
  return RpcTest.makeClient(GraphSharedWorkerRpc).pipe(
    Effect.provide(
      GraphSharedWorkerRpc.toLayer({
        audioMemoStatusStream: () => Stream.empty,
        healthStream: () => Stream.empty,
        syncStatusStream: () => Stream.empty,
        placeholder: () => Effect.void,
        updateMessagePort: () => Effect.void,
        removeAudioMemo: remove,
      }),
    ),
  );
}

function mockRecorder(recording: AudioMemoRecorder.RecordingMetadata, cancel: () => void) {
  const stop = vi.fn();

  vi.spyOn(AudioMemoRecorder, "events").mockImplementation(() => {
    return Effect.gen(function* () {
      const captured = yield* Deferred.make<AudioMemoRecorder.Event>();
      stop.mockImplementation(() => {
        return Deferred.doneUnsafe(
          captured,
          Exit.succeed(
            AudioMemoRecorder.Event.Captured({ capture: { blob: new Blob(["audio"]), recording } }),
          ),
        );
      });
      yield* Effect.addFinalizer(() => Effect.sync(cancel));

      return Stream.concat(
        Stream.succeed(AudioMemoRecorder.Event.Started({ recorder: { stop, cancel } })),
        Stream.fromEffect(Deferred.await(captured)),
      );
    });
  });

  return stop;
}
