import { Chunk, Data, Deferred, Effect, Layer, pipe, Queue, Context, Stream } from "effect";
import * as Y from "yjs";
import { ySyncPluginKey } from "y-prosemirror";
import * as EventRepo from "@manotes/shared/event.repo";
import { Array, DateTime, Option } from "effect";
import * as RecordSchema from "@manotes/shared/record.schema";
import * as RecordRepo from "@manotes/shared/record.repo";
import * as RecordCache from "./record-cache.service";
import { streamDebounceNoDrop } from "./stream-debounce-no-drop";

const REMOTE_ORIGIN = Symbol("remote");

type EditorUpdateOrigin = typeof REMOTE_ORIGIN | typeof ySyncPluginKey | Y.UndoManager | null;

type EditorUpdateListener = (
  update: Uint8Array<ArrayBufferLike>,
  origin: EditorUpdateOrigin,
) => void;

class OutcomingUpdateCtx extends Data.Class<{
  update: Uint8Array<ArrayBufferLike>;
  origin: EditorUpdateOrigin;
}> {}

export type SetupInput = { recordId: string };

export class Service extends Context.Service<Service>()("EditorSyncService.Service", {
  make: Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const recordRepo = yield* RecordRepo.Service;
    const recordCache = yield* RecordCache.Service;

    const applyMaterializedYUpdate = Effect.fn("applyMaterializedYUpdate")(function* (
      doc: Y.Doc,
      materializedYUpdate: RecordSchema.MaterializedYUpdate,
    ) {
      if (materializedYUpdate === null) return;

      yield* Effect.sync(() => Y.applyUpdate(doc, materializedYUpdate, REMOTE_ORIGIN));
    });

    const applyIncomingUpdates = Effect.fn("applyIncomingUpdates")(function* (
      doc: Y.Doc,
      recordId: string,
      initialLastKnownLocalSeq: number,
    ) {
      let lastKnownLocalSeq = initialLastKnownLocalSeq;

      while (true) {
        yield* Effect.logDebug("Last known localSeq:", lastKnownLocalSeq);

        const reactiveStream = yield* eventRepo.streamUpdatesForRecord({
          recordId,
          afterLocalSeq: lastKnownLocalSeq,
        });

        const firstBatch = yield* reactiveStream.pipe(
          Stream.filter(Array.isReadonlyArrayNonEmpty),
          Stream.runHead,
        );

        if (Option.isNone(firstBatch)) {
          yield* Effect.logError("Stream ended without events");
          continue;
        }

        const events = firstBatch.value;
        yield* Effect.logDebug("Received batch of events", events.length);

        yield* Effect.forEach(events, (event) => {
          return Effect.sync(() => Y.applyUpdate(doc, event.payload, REMOTE_ORIGIN));
        });

        lastKnownLocalSeq = Array.lastNonEmpty(events).localSeq;
      }
    });

    const persistChunk = Effect.fn("persistChunk")(function* (
      recordId: string,
      chunk: Chunk.NonEmptyChunk<OutcomingUpdateCtx>,
    ) {
      const allUpdateCtxs = Chunk.toArray(chunk);

      yield* Effect.log("Saving updates, count:", allUpdateCtxs.length);

      const merged = Y.mergeUpdates(
        pipe(
          allUpdateCtxs,
          Array.map((updateCtx) => updateCtx.update),
        ),
      );

      yield* eventRepo.create({
        payload: merged,
        createdAt: yield* DateTime.now,
        type: "update",
        recordId: recordId,
      });
    });

    const saveOutcomingUpdates = Effect.fn("saveOutcomingUpdates")(function* (
      doc: Y.Doc,
      recordId: string,
    ) {
      yield* Stream.callback<OutcomingUpdateCtx>((queue) => {
        return Effect.sync(() => {
          const listener: EditorUpdateListener = (update, origin) => {
            Queue.offerUnsafe(queue, new OutcomingUpdateCtx({ update, origin }));
          };

          doc.on("update", listener);

          return pipe(
            Effect.sync(() => doc.off("update", listener)),
            Effect.andThen(Queue.end(queue)),
          );
        });
      }).pipe(
        Stream.filter((updateCtx) => updateCtx.origin !== REMOTE_ORIGIN),
        streamDebounceNoDrop("1 second", (remaining) => {
          return persistChunk(recordId, remaining).pipe(Effect.orDie);
        }),
        Stream.runForEach((chunk) => persistChunk(recordId, chunk)),
      );
    });

    const setupDoc = Effect.fn("EditorSyncService.setupDoc")(
      function* (doc: Y.Doc, input: SetupInput, ready: Deferred.Deferred<void>) {
        // The boot payload is read atomically once; events drive the doc afterwards.
        const initial = pipe(
          yield* recordRepo.findBootById(input.recordId),
          Option.getOrElse(RecordRepo.bootResultEmpty),
        );

        // Prime the cache before the content applies (which mounts the
        // backlink node views): they resolve their labels instantly from the
        // seed and keep updating reactively. Boot never waits on label
        // queries.
        yield* recordCache.prime(initial.backlinks);

        yield* Effect.all(
          [
            Effect.gen(function* () {
              yield* applyMaterializedYUpdate(doc, initial.record.materializedYUpdate);
              yield* Deferred.succeed(ready, void 0);

              yield* applyIncomingUpdates(doc, input.recordId, initial.record.lastEventLocalSeq);
            }),
            saveOutcomingUpdates(doc, input.recordId),
          ],
          { concurrency: "unbounded" },
        );
      },
      (effect, _doc, input) => effect.pipe(Effect.annotateLogs({ recordId: input.recordId })),
    );

    return {
      setupDoc,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(RecordRepo.Service.layer),
    Layer.provide(RecordCache.Service.layer),
  );
}
