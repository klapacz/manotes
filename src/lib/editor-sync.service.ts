import { Effect, pipe, Stream, Data, flow } from "effect";
import * as Y from "yjs";
import * as EventRepo from "./event.repo";
import { Array, Chunk, DateTime, Option } from "effect";
import * as NoteSchema from "./note.schema";
import * as NoteRepo from "./note.repo";
import { streamDebounceNoDrop } from "./stream-debounce-no-drop";

const REMOTE_ORIGIN = Symbol("remote");

class OutcomingUpdateCtx extends Data.Class<{
  update: Uint8Array<ArrayBufferLike>;
  origin: unknown;
}> {}

export type SetupInput = {
  noteId: string;
  isDaily: boolean;
  initial: Option.Option<{
    materializedYUpdate: typeof NoteSchema.MaterializedYUpdate.Type;
    lastEventLocalSeq: number;
  }>;
};

export class Service extends Effect.Service<Service>()(
  "EditorSyncService.Service",
  {
    dependencies: [EventRepo.Service.Default, NoteRepo.Service.Default],
    effect: Effect.gen(function* () {
      const eventRepo = yield* EventRepo.Service;
      const noteRepo = yield* NoteRepo.Service;

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
        initialLastKnownLocalSeq: number,
      ) {
        yield* Effect.iterate(initialLastKnownLocalSeq, {
          while: () => true,
          body: (lastKnownLocalSeq) =>
            Effect.gen(function* () {
              yield* Effect.logDebug("Last known localSeq:", lastKnownLocalSeq);

              const reactiveStream = yield* eventRepo.streamUpdatesForNote({
                noteId,
                afterLocalSeq: lastKnownLocalSeq,
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
                return lastKnownLocalSeq;
              }

              const events = firstBatch.value;
              yield* Effect.logDebug("Received batch of events", events.length);

              yield* Effect.forEach(events, (event) =>
                Effect.sync(() =>
                  Y.applyUpdate(doc, event.payload, REMOTE_ORIGIN),
                ),
              );

              const lastEvent = Array.lastNonEmpty(events);
              const nextLastKnownLocalSeq = lastEvent.localSeq;

              return nextLastKnownLocalSeq;
            }),
        });
      });

      const saveOutcomingUpdates = Effect.fn("saveOutcomingUpdates")(function* (
        doc: Y.Doc,
        noteId: string,
        isDaily: boolean,
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
                createdAt: yield* DateTime.now,
                type: "update",
                noteId: noteId,
                isDaily,
              });
            }),
          ),
        );
      });

      const setupDoc = Effect.fn("EditorSyncService.setupDoc")(
        function* (doc: Y.Doc, input: SetupInput) {
          const initial = yield* Option.match(input.initial, {
            onSome: Effect.succeed,
            onNone: flow(
              () => noteRepo.findById(input.noteId),
              Effect.map(
                Option.getOrElse(() => ({
                  lastEventLocalSeq: 0,
                  materializedYUpdate: null,
                })),
              ),
            ),
          });

          yield* Effect.all(
            [
              Effect.gen(function* () {
                yield* applyMaterializedYUpdate(
                  doc,
                  initial.materializedYUpdate,
                );

                yield* applyIncomingUpdates(
                  doc,
                  input.noteId,
                  initial.lastEventLocalSeq,
                );
              }),
              saveOutcomingUpdates(doc, input.noteId, input.isDaily),
            ],
            { concurrency: "unbounded" },
          );
        },
        (effect, _doc, input) =>
          effect.pipe(Effect.annotateLogs({ noteId: input.noteId })),
      );

      return {
        setupDoc,
      };
    }),
  },
) {}
