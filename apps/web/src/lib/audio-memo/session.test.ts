import { afterEach, expect, it, vi } from "vite-plus/test";
import { DateTime, Deferred, Effect, Option, Queue, Schema, Stream, SubscriptionRef } from "effect";
import { RpcTest } from "effect/rpc";
import { DB } from "@manotes/shared/db.service";
import { RecordSchema } from "@manotes/shared/record.schema";
import { AudioMemoFiles } from "./files";
import { AudioMemoRecorder } from "./recorder";
import { AudioMemoRepo } from "./repo";
import { AudioMemoService } from "./service";
import { AudioMemoSession, State } from "./session";
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
        const states = yield* Queue.make<AudioMemoSession.State>();
        const actionStarted = yield* Deferred.make<void>();
        const finishAction = yield* Deferred.make<void>();
        const cancel = vi.fn();

        const queryError = yield* Schema.decodeUnknownEffect(Schema.String)(null).pipe(Effect.flip);

        let failQuery = false;

        vi.spyOn(AudioMemoRecorder, "start").mockImplementation(async (_element, onStopped) => ({
          stop: () => onStopped(new Blob(["audio"]), { ...recording, durationMs: 1200 }),
          cancel,
        }));
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

        vi.spyOn(AudioMemoRepo, "get").mockImplementation(() => {
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

        const client = yield* RpcTest.makeClient(GraphSharedWorkerRpc).pipe(
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

        // SAFETY: The stubbed recorder never reads the DOM element.
        const element = {} as HTMLElement;

        const session = yield* AudioMemoSession.make(element, {
          id: RecordSchema.Id.make(recording.recordId),
          createdAt: recordedAt,
          intent: recording.intent,
        }).pipe(
          Effect.provideService(GraphWorkerClient.Service, { client }),
          Effect.provideService(
            DB.Service,
            DB.Service.of({
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
            }),
          ),
          Effect.provideService(DB.Config, {
            localGraphId: "test-graph",
            databasePath: "test.db",
          }),
        );

        yield* Effect.addFinalizer(() => Deferred.succeed(finishAction, undefined));

        const next = (tag: AudioMemoSession.State["_tag"]) => {
          return Stream.fromQueue(states).pipe(
            Stream.filter(State.$is(tag)),
            Stream.runHead,
            Effect.map(Option.getOrThrow),
          );
        };

        yield* session.changes.pipe(
          Stream.runForEach((state) => Queue.offer(states, state)),
          Effect.forkScoped,
        );
        yield* next("Recording");
        yield* session.stop;
        yield* next("Pending");
        const failed: AudioMemoRepo.Record = { ...recording, state: "error" };
        yield* SubscriptionRef.set(rows, [failed]);
        yield* next("TranscriptionFailed");
        yield* session[action];
        const failureTag = action === "retry" ? "RetryFailed" : "RemoveFailed";
        yield* next(failureTag);

        failQuery = true;
        yield* SubscriptionRef.set(rows, [failed]);
        yield* next("LoadFailed");
        failQuery = false;
        yield* session.reload;
        expect(yield* next(failureTag)).toEqual(
          action === "retry"
            ? State.RetryFailed({ recording: failed })
            : State.RemoveFailed({ recording: failed }),
        );
        expect(action === "retry" ? retry : remove).toHaveBeenCalledTimes(1);

        yield* session[action];
        yield* Deferred.await(actionStarted);
        yield* next(action === "retry" ? "Retrying" : "Removing");

        const completed: AudioMemoRepo.Record = { ...recording, state: "completed" };
        yield* SubscriptionRef.set(rows, [completed]);
        expect(yield* next("Pending")).toEqual(State.Pending({ recording: completed }));
        expect(cancel).not.toHaveBeenCalled();

        yield* SubscriptionRef.set(rows, []);
        expect(yield* next("Closed")).toEqual(State.Closed());
        const subscriptionsBeforeFinish = listReactive.mock.calls.length;
        yield* Deferred.succeed(finishAction, undefined);
        expect(yield* next("Closed")).toEqual(State.Closed());

        if (action === "remove") {
          expect(listReactive).toHaveBeenCalledTimes(subscriptionsBeforeFinish);
        }
      }).pipe(Effect.scoped),
    );
  },
);
