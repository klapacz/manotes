import { Effect, pipe, Stream, Data } from "effect";
import * as Y from "yjs";
import * as EventRepo from "./event.repo";
import { Array, Chunk, DateTime, Option } from "effect";
import * as NoteSchema from "./note.schema";
import { streamDebounceNoDrop } from "./stream-debounce-no-drop";

const REMOTE_ORIGIN = Symbol("remote");

class OutcomingUpdateCtx extends Data.Class<{
  update: Uint8Array<ArrayBufferLike>;
  origin: unknown;
}> {}

export class Service extends Effect.Service<Service>()(
  "EditorSyncService.Service",
  {
    dependencies: [EventRepo.Service.Default],
    effect: Effect.gen(function* () {
      const eventRepo = yield* EventRepo.Service;

      const applyMaterializedYUpdate = Effect.fn("applyMaterializedYUpdate")(
        function* (
          doc: Y.Doc,
          materializedYUpdate: typeof NoteSchema.MaterializedYUpdate.Type,
        ) {
          if (materializedYUpdate === null) {
            return;
          }

          yield* Effect.sync(() =>
            Y.applyUpdate(doc, materializedYUpdate, REMOTE_ORIGIN),
          );
        },
      );

      const applyIncomingUpdates = Effect.fn("applyIncomingUpdates")(function* (
        doc: Y.Doc,
        noteId: string,
        initialLastKnownEventId: number,
      ) {
        yield* Effect.iterate(initialLastKnownEventId, {
          while: () => true,
          body: (lastKnownEventId) =>
            Effect.gen(function* () {
              yield* Effect.logDebug("Last known ID:", lastKnownEventId);

              const reactiveStream = yield* eventRepo.streamUpdatesForNote({
                noteId,
                afterId: lastKnownEventId,
              });

              const firstBatch = yield* reactiveStream.pipe(
                Stream.filterMap((events) =>
                  Array.isNonEmptyReadonlyArray(events)
                    ? Option.some(events)
                    : Option.none(),
                ),
                Stream.runHead,
              );

              if (Option.isNone(firstBatch)) {
                yield* Effect.logError("Stream ended without events");
                return lastKnownEventId;
              }

              const events = firstBatch.value;
              yield* Effect.logDebug("Received batch of events", events.length);

              yield* Effect.forEach(events, (event) =>
                Effect.sync(() =>
                  Y.applyUpdate(doc, event.payload, REMOTE_ORIGIN),
                ),
              );

              const lastEvent = Array.lastNonEmpty(events);
              const nextLastKnownId = lastEvent.id;

              return nextLastKnownId;
            }),
        });
      });

      const saveOutcomingUpdates = Effect.fn("saveOutcomingUpdates")(function* (
        doc: Y.Doc,
        noteId: string,
      ) {
        yield* Stream.asyncPush<OutcomingUpdateCtx>((emit) =>
          Effect.sync(() =>
            doc.on("update", (update, origin, _doc) => {
              emit.single(new OutcomingUpdateCtx({ update, origin }));
            }),
          ),
        ).pipe(
          Stream.filter((updateCtx) => updateCtx.origin !== REMOTE_ORIGIN),
          streamDebounceNoDrop("1 second"),
          Stream.runForEach((chunk) =>
            Effect.gen(function* () {
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
                timestamp: yield* DateTime.now,
                type: "update",
                noteId: noteId,
              });
            }),
          ),
        );
      });

      const setupDoc = Effect.fn("EditorSyncService.setupDoc")(
        function* (doc: Y.Doc, note: typeof NoteSchema.Record.Type) {
          yield* Effect.all(
            [
              Effect.gen(function* () {
                yield* applyMaterializedYUpdate(doc, note.materializedYUpdate);

                yield* applyIncomingUpdates(doc, note.id, note.lastEventId);
              }),
              saveOutcomingUpdates(doc, note.id),
            ],
            { concurrency: "unbounded" },
          );
        },
        (effect, _doc, note) =>
          effect.pipe(Effect.annotateLogs({ noteId: note.id })),
      );

      return {
        setupDoc,
      };
    }),
  },
) {}
