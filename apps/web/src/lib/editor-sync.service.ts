import { Chunk, Data, Deferred, Effect, Layer, pipe, Queue, ServiceMap, Stream } from "effect";
import * as Y from "yjs";
import * as EventRepo from "./event.repo";
import { Array, DateTime, Option } from "effect";
import * as NoteSchema from "./note.schema";
import * as EditorNoteBootCache from "./editor/note-boot-cache.service";
import { streamDebounceNoDrop } from "./stream-debounce-no-drop";

const REMOTE_ORIGIN = Symbol("remote");

class OutcomingUpdateCtx extends Data.Class<{
  update: Uint8Array<ArrayBufferLike>;
  origin: unknown;
}> {}

export type SetupInput = {
  noteId: string;
  isDaily: boolean;
};

export class Service extends ServiceMap.Service<Service>()("EditorSyncService.Service", {
  make: Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const noteBootCache = yield* EditorNoteBootCache.Service;

    const applyMaterializedYUpdate = Effect.fn("applyMaterializedYUpdate")(function* (
      doc: Y.Doc,
      materializedYUpdate: typeof NoteSchema.MaterializedYUpdate.Type,
    ) {
      if (materializedYUpdate === null) {
        return;
      }

      yield* Effect.sync(() => Y.applyUpdate(doc, materializedYUpdate, REMOTE_ORIGIN));
    });

    const applyIncomingUpdates = Effect.fn("applyIncomingUpdates")(function* (
      doc: Y.Doc,
      noteId: string,
      initialLastKnownLocalSeq: number,
    ) {
      let lastKnownLocalSeq = initialLastKnownLocalSeq;

      while (true) {
        yield* Effect.logDebug("Last known localSeq:", lastKnownLocalSeq);

        const reactiveStream = yield* eventRepo.streamUpdatesForNote({
          noteId,
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

        yield* Effect.forEach(events, (event) =>
          Effect.sync(() => Y.applyUpdate(doc, event.payload, REMOTE_ORIGIN)),
        );

        lastKnownLocalSeq = Array.lastNonEmpty(events).localSeq;
      }
    });

    const persistChunk = Effect.fn("persistChunk")(function* (
      noteId: string,
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
        noteId: noteId,
      });
    });

    const saveOutcomingUpdates = Effect.fn("saveOutcomingUpdates")(function* (
      doc: Y.Doc,
      noteId: string,
    ) {
      yield* Stream.callback<OutcomingUpdateCtx>((queue) =>
        Effect.sync(() => {
          const listener = (update: Uint8Array<ArrayBufferLike>, origin: unknown) => {
            Queue.offerUnsafe(queue, new OutcomingUpdateCtx({ update, origin }));
          };

          doc.on("update", listener);

          return pipe(
            Effect.sync(() => doc.off("update", listener)),
            Effect.andThen(Queue.end(queue)),
          );
        }),
      ).pipe(
        Stream.filter((updateCtx) => updateCtx.origin !== REMOTE_ORIGIN),
        streamDebounceNoDrop("1 second", (remaining) =>
          persistChunk(noteId, remaining).pipe(Effect.orDie),
        ),
        Stream.runForEach((chunk) => persistChunk(noteId, chunk)),
      );
    });

    const setupDoc = Effect.fn("EditorSyncService.setupDoc")(
      function* (doc: Y.Doc, input: SetupInput, ready: Deferred.Deferred<void>) {
        const noteChanges = yield* noteBootCache.changes(input.noteId);
        const initial = pipe(
          yield* noteChanges.pipe(Stream.runHead),
          Option.getOrElse(() => Option.none<EditorNoteBootCache.NoteBoot>()),
          Option.getOrElse(() => ({
            lastEventLocalSeq: 0,
            materializedYUpdate: null,
          })),
        );

        yield* Effect.all(
          [
            noteChanges.pipe(Stream.runDrain), // Keep stream warm for lifetime of editor
            Effect.gen(function* () {
              yield* applyMaterializedYUpdate(doc, initial.materializedYUpdate);
              yield* Deferred.succeed(ready, void 0);

              yield* applyIncomingUpdates(doc, input.noteId, initial.lastEventLocalSeq);
            }),
            saveOutcomingUpdates(doc, input.noteId),
          ],
          { concurrency: "unbounded" },
        );
      },
      (effect, _doc, input) => effect.pipe(Effect.annotateLogs({ noteId: input.noteId })),
    );

    return {
      setupDoc,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(EditorNoteBootCache.Service.layer),
  );
}
