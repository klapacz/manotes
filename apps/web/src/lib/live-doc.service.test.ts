import { NoteSchema } from "@manotes/shared/note.schema";
import { Deferred, Effect, Exit, Option, Scope, Stream, SubscriptionRef } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import * as EditorSyncService from "./editor-sync.service";
import { LiveDoc } from "./live-doc.service";

const recordId = NoteSchema.Id.make("record_id:shared");

// The fake sync owns a long-lived session just like setupDoc, with controlled boot.
describe("shared live docs", () => {
  it("shares boot and edits, retains active docs, and stops sync before destroying idle docs", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const boot = yield* Deferred.make<void>();
        let starts = 0;
        const cleanup: boolean[] = [];

        const sync = EditorSyncService.Service.of({
          setupDoc: (doc, _input, ready) => {
            return Effect.gen(function* () {
              starts++;
              yield* Deferred.await(boot);
              yield* Deferred.succeed(ready, undefined);
              yield* Effect.never;
            }).pipe(Effect.ensuring(Effect.sync(() => cleanup.push(doc.isDestroyed))));
          },
        });

        const service = yield* LiveDoc.Service.make.pipe(
          Effect.provideService(EditorSyncService.Service, sync),
        );

        const firstScope = yield* Scope.make();
        const secondScope = yield* Scope.make();
        const first = yield* service.acquire({ recordId }).pipe(Scope.provide(firstScope));
        const second = yield* service.acquire({ recordId }).pipe(Scope.provide(secondScope));

        expect(first).toBe(second);
        expect(yield* SubscriptionRef.get(first)).toEqual(LiveDoc.Doc.Loading());
        yield* Deferred.succeed(boot, undefined);
        const doc = yield* waitReady(first);
        expect(starts).toBe(1);
        expect(yield* waitReady(second)).toBe(doc);
        doc.getMap("attrs").set("test", 42);
        expect((yield* waitReady(second)).getMap("attrs").get("test")).toBe(42);

        yield* Scope.close(firstScope, Exit.void);
        yield* TestClock.adjust("8 seconds");
        expect(doc.isDestroyed).toBe(false);
        expect(cleanup).toEqual([]);

        yield* Scope.close(secondScope, Exit.void);
        yield* TestClock.adjust("6999 millis");
        expect(doc.isDestroyed).toBe(false);
        yield* TestClock.adjust("1 millis");
        expect(doc.isDestroyed).toBe(true);
        expect(cleanup).toEqual([false]);

        const reopened = yield* service.acquire({ recordId });
        expect(reopened).not.toBe(first);
        expect(yield* waitReady(reopened)).not.toBe(doc);
        expect(starts).toBe(2);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("keeps record and graph sessions separate", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sync = EditorSyncService.Service.of({
          setupDoc: (_doc, _input, ready) => {
            return Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never));
          },
        });

        const firstGraph = yield* LiveDoc.Service.make.pipe(
          Effect.provideService(EditorSyncService.Service, sync),
        );

        const secondGraph = yield* LiveDoc.Service.make.pipe(
          Effect.provideService(EditorSyncService.Service, sync),
        );

        const first = yield* firstGraph.acquire({ recordId });

        const otherRecord = yield* firstGraph.acquire({
          recordId: NoteSchema.Id.make("record_id:other"),
        });

        const otherGraph = yield* secondGraph.acquire({ recordId });
        const doc = yield* waitReady(first);
        expect(yield* waitReady(otherRecord)).not.toBe(doc);
        expect(yield* waitReady(otherGraph)).not.toBe(doc);
      }).pipe(Effect.scoped),
    );
  });

  it("publishes initialization failures to every consumer", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sync = EditorSyncService.Service.of({ setupDoc: () => Effect.die("boot failed") });

        const service = yield* LiveDoc.Service.make.pipe(
          Effect.provideService(EditorSyncService.Service, sync),
        );

        const first = yield* service.acquire({ recordId });
        const second = yield* service.acquire({ recordId });

        const failure = yield* SubscriptionRef.changes(first).pipe(
          Stream.filter(LiveDoc.Doc.$is("Error")),
          Stream.runHead,
        );

        expect(Option.getOrThrow(failure)).toEqual(
          LiveDoc.Doc.Error({ message: "Failed to load record." }),
        );
        expect(yield* SubscriptionRef.get(second)).toEqual(Option.getOrThrow(failure));
      }).pipe(Effect.scoped),
    );
  });

  it("interrupts initialization and destroys the doc when its last consumer leaves", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<Y.Doc>();
        let stopped = false;

        const sync = EditorSyncService.Service.of({
          setupDoc: (doc) => {
            return Deferred.succeed(started, doc).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(
                Effect.sync(() => {
                  stopped = true;
                }),
              ),
            );
          },
        });

        const service = yield* LiveDoc.Service.make.pipe(
          Effect.provideService(EditorSyncService.Service, sync),
        );

        const scope = yield* Scope.make();
        const state = yield* service.acquire({ recordId }).pipe(Scope.provide(scope));
        const doc = yield* Deferred.await(started);
        yield* Scope.close(scope, Exit.void);
        yield* TestClock.adjust("7 seconds");
        expect(stopped).toBe(true);
        expect(doc.isDestroyed).toBe(true);
        expect(yield* SubscriptionRef.get(state)).toEqual(LiveDoc.Doc.Loading());
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });
});

function waitReady(state: SubscriptionRef.SubscriptionRef<LiveDoc.Doc>) {
  return SubscriptionRef.changes(state).pipe(
    Stream.filter(LiveDoc.Doc.$is("Ready")),
    Stream.map(({ doc }) => doc),
    Stream.runHead,
    Effect.flatMap(Effect.fromOption),
  );
}
