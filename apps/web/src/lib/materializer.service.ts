import { Array as Arr, Effect, Layer, Option, Order, pipe, Record, Context, Stream } from "effect";
import * as Y from "yjs";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as BacklinkService from "./materializer/backlink/service";
import * as NoteRepo from "./note.repo";
import { findFirstH1Text, yDocToNodeJSON } from "./prosemirror-materializer.utils";

const MAX_FETCHED_UNDONE_EVENTS = 100;

export class Service extends Context.Service<Service>()("Materializer.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;
    const eventRepo = yield* EventRepo.Service;
    const noteRepo = yield* NoteRepo.Service;
    const backlinkService = yield* BacklinkService.Service;
    const checkpointRepo = yield* MaterializationCheckpointRepo.Service;

    const materializeNoteUpTo = Effect.fn("MaterializerService.materializeNoteUpTo")(function* ({
      noteId,
      upToLocalSeq,
    }: {
      noteId: string;
      upToLocalSeq: number;
    }) {
      const noteOption = yield* noteRepo.findById(noteId);

      if (Option.isSome(noteOption)) {
        const note = noteOption.value;

        const events = yield* eventRepo.findUpdatesForNoteBetweenIds({
          noteId,
          afterLocalSeq: note.lastEventLocalSeq,
          upToLocalSeq,
        });

        if (!Arr.isReadonlyArrayNonEmpty(events)) return;

        const yDoc = yield* applyMaterializationUpdates(note.materializedYUpdate, events);

        const materialized = buildMaterializedNoteFields({
          yDoc,
        });
        const lastEvent = Arr.lastNonEmpty(events);

        yield* noteRepo.updateById(noteId, {
          title: materialized.title,
          content: materialized.content,
          materializedYUpdate: materialized.materializedYUpdate,
          updatedAt: lastEvent.createdAt,
          lastEventLocalSeq: upToLocalSeq,
        });

        yield* backlinkService.replaceForSourceNote({
          sourceId: noteId,
          content: materialized.content,
        });

        yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
        return;
      }

      const events = yield* eventRepo.findUpdatesForNoteBetweenIds({
        noteId,
        afterLocalSeq: 0,
        upToLocalSeq,
      });

      if (!Arr.isReadonlyArrayNonEmpty(events)) return;

      const yDoc = yield* applyMaterializationUpdates(null, events);

      const firstEvent = Arr.headNonEmpty(events);
      const lastEvent = Arr.lastNonEmpty(events);
      const materialized = buildMaterializedNoteFields({
        yDoc,
      });

      yield* noteRepo.create({
        id: noteId,
        title: materialized.title,
        content: materialized.content,
        materializedYUpdate: materialized.materializedYUpdate,
        createdAt: firstEvent.createdAt,
        updatedAt: lastEvent.createdAt,
        lastEventLocalSeq: upToLocalSeq,
      });

      yield* backlinkService.replaceForSourceNote({
        sourceId: noteId,
        content: materialized.content,
      });

      yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
    });

    const start = Effect.fn("MaterializerService.start")(function* () {
      // Checkpoint advances only after a batch is fully materialized.
      // This makes replay idempotent after worker restarts.
      const initialCursor = yield* checkpointRepo.getLastAppliedLocalSeq();
      yield* Effect.logInfo(`Starting materializer at global cursor ${initialCursor}`);

      let lastAppliedLocalSeq = initialCursor;

      while (true) {
        const stream = yield* eventRepo.streamUpdatesAfterGlobalId(
          lastAppliedLocalSeq,
          MAX_FETCHED_UNDONE_EVENTS,
        );

        const nextBatch = yield* stream.pipe(
          Stream.filter(Arr.isReadonlyArrayNonEmpty),
          Stream.runHead,
        );

        if (Option.isNone(nextBatch)) {
          continue;
        }

        const batch = nextBatch.value;
        const newestLocalSeq = Arr.lastNonEmpty(batch).localSeq;
        const targets = buildMaterializationTargets(batch);

        yield* db.transaction(
          Effect.gen(function* () {
            yield* Effect.forEach(
              targets,
              (target) =>
                materializeNoteUpTo({
                  noteId: target.noteId,
                  upToLocalSeq: target.upToLocalSeq,
                }),
              {
                concurrency: 1,
                discard: true,
              },
            );

            yield* checkpointRepo.setLastAppliedLocalSeq(newestLocalSeq);
          }),
        );

        yield* Effect.logInfo(`Processed ${batch.length} events up to ${newestLocalSeq}`);
        lastAppliedLocalSeq = newestLocalSeq;
      }
    });

    return {
      start,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(DB.Service.layer),
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(NoteRepo.Service.layer),
    Layer.provide(BacklinkService.Service.layer),
    Layer.provide(MaterializationCheckpointRepo.Service.layer),
  );
}

const applyMaterializationUpdates = Effect.fn("MaterializerService.applyMaterializationUpdates")(
  function* (
    baseSnapshot: Uint8Array<ArrayBufferLike> | null,
    events: ReadonlyArray<{ payload: Uint8Array<ArrayBufferLike> }>,
  ) {
    const yDoc = new Y.Doc();

    if (baseSnapshot !== null) {
      yield* Effect.sync(() => Y.applyUpdate(yDoc, baseSnapshot));
    }

    yield* Effect.forEach(events, (event) => Effect.sync(() => Y.applyUpdate(yDoc, event.payload)));

    return yDoc;
  },
);

export const FALLBACK_TITLE = "Untitled";

function buildMaterializedNoteFields({ yDoc }: { yDoc: Y.Doc }) {
  const materializedYUpdate = Y.encodeStateAsUpdate(yDoc);
  const content = yDocToNodeJSON({ yDoc });
  const extractedTitle = findFirstH1Text(content);
  // Daily note titles are deterministic from note id (date), so user edits in
  // the document body do not mutate the canonical daily title.
  const title = extractedTitle.length > 0 ? extractedTitle : FALLBACK_TITLE;

  return {
    title,
    content,
    materializedYUpdate,
  };
}

type MaterializationTarget = {
  noteId: string;
  upToLocalSeq: number;
};

function buildMaterializationTargets(
  events: ReadonlyArray<{ noteId: string; localSeq: number }>,
): ReadonlyArray<MaterializationTarget> {
  return pipe(
    events,
    // 1) Partition the batch by note so each note is handled once.
    Arr.groupBy((event) => event.noteId),
    // 2) For each note, keep only the event with the highest localSeq.
    //    Materializing up to that localSeq implicitly covers earlier events.
    Record.map((noteEvents) =>
      Arr.max(
        noteEvents,
        pipe(
          Order.Number,
          Order.mapInput((event: { noteId: string; localSeq: number }) => event.localSeq),
        ),
      ),
    ),
    // 3) Convert the record back into explicit targets.
    Record.toEntries,
    Arr.map(([noteId, event]) => ({
      noteId,
      upToLocalSeq: event.localSeq,
    })),
    // 4) Process targets in ascending event localSeq order for deterministic replay.
    Arr.sort(
      pipe(
        Order.Number,
        Order.mapInput((record: MaterializationTarget) => record.upToLocalSeq),
      ),
    ),
  );
}
