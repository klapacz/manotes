import { Array as Arr, Effect, Layer, Option, Order, pipe, Record, Context, Stream } from "effect";
import * as Y from "yjs";
import * as DB from "./db.service";
import * as EventSchema from "./event.schema";
import * as EventRepo from "./event.repo";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as BacklinkService from "./materializer/backlink/service";
import * as NoteEmbeddingService from "./note-embedding.service";
import * as NoteRepo from "./note.repo";
import { extractText, findFirstH1Text, yDocToNodeJSON } from "./prosemirror-materializer.utils";
import { toLocalDateString } from "./temporal/utils";

const MAX_FETCHED_UNDONE_EVENTS = 100;

export class Service extends Context.Service<Service>()("Materializer.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;
    const eventRepo = yield* EventRepo.Service;
    const noteRepo = yield* NoteRepo.Service;
    const backlinkService = yield* BacklinkService.Service;
    const noteEmbeddingService = yield* NoteEmbeddingService.Service;
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

        const events = yield* eventRepo.findForNoteBetweenIds({
          noteId,
          afterLocalSeq: note.lastEventLocalSeq,
          upToLocalSeq,
        });

        if (!Arr.isReadonlyArrayNonEmpty(events)) return;

        const summary = yield* summarizeEvents(events);

        const yDoc = yield* applyMaterializationUpdates(
          note.materializedYUpdate,
          summary.byType.update,
        );

        const materialized = buildMaterializedNoteFields({ yDoc });

        const updatedAt = summary.last.createdAt;

        yield* noteRepo.updateById(noteId, {
          title: materialized.title,
          content: materialized.content,
          text: materialized.text,
          date: summary.latestDate ?? note.date,
          materializedYUpdate: materialized.materializedYUpdate,
          updatedAt,
          lastEventLocalSeq: upToLocalSeq,
        });

        yield* backlinkService.replaceForSourceNote({
          sourceId: noteId,
          content: materialized.content,
        });

        yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
        return {
          noteId,
          text: materialized.text,
          updatedAt,
        };
      }

      const events = yield* eventRepo.findForNoteBetweenIds({
        noteId,
        afterLocalSeq: 0,
        upToLocalSeq,
      });

      if (!Arr.isReadonlyArrayNonEmpty(events)) return;

      const summary = yield* summarizeEvents(events);

      const yDoc = yield* applyMaterializationUpdates(null, summary.byType.update);

      const materialized = buildMaterializedNoteFields({
        yDoc,
      });

      const updatedAt = summary.last.createdAt;

      yield* noteRepo.create({
        id: noteId,
        title: materialized.title,
        content: materialized.content,
        text: materialized.text,
        date: summary.latestDate ?? toLocalDateString(summary.first.createdAt),
        materializedYUpdate: materialized.materializedYUpdate,
        createdAt: summary.first.createdAt,
        updatedAt,
        lastEventLocalSeq: upToLocalSeq,
      });

      yield* backlinkService.replaceForSourceNote({
        sourceId: noteId,
        content: materialized.content,
      });

      yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
      return {
        noteId,
        text: materialized.text,
        updatedAt,
      };
    });

    const start = Effect.fn("MaterializerService.start")(function* () {
      // Checkpoint advances only after a batch is fully materialized.
      // This makes replay idempotent after worker restarts.
      const initialCursor = yield* checkpointRepo.getLastAppliedLocalSeq();
      yield* Effect.logInfo(`Starting materializer at global cursor ${initialCursor}`);

      yield* noteEmbeddingService.backfillMissing().pipe(
        Effect.catchCause((cause) => Effect.logError("Note embedding backfill failed", cause)),
        Effect.forkScoped,
      );

      let lastAppliedLocalSeq = initialCursor;

      while (true) {
        const stream = yield* eventRepo.streamAfterGlobalId(
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

        const materializedNotes = yield* db.transaction(
          Effect.gen(function* () {
            const materializedNotes = yield* Effect.forEach(
              targets,
              (target) =>
                materializeNoteUpTo({
                  noteId: target.noteId,
                  upToLocalSeq: target.upToLocalSeq,
                }),
              {
                concurrency: 1,
              },
            );

            yield* checkpointRepo.setLastAppliedLocalSeq(newestLocalSeq);
            return materializedNotes.filter((note) => note !== undefined);
          }),
        );

        yield* Effect.forEach(
          materializedNotes,
          (note) => noteEmbeddingService.upsertForMaterializedNote(note),
          {
            concurrency: 1,
            discard: true,
          },
        ).pipe(
          Effect.catchCause((cause) => Effect.logError("Note embedding generation failed", cause)),
          Effect.forkScoped,
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
    Layer.provide(NoteEmbeddingService.Service.layer),
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

function buildMaterializedNoteFields({ yDoc }: { yDoc: Y.Doc }) {
  const materializedYUpdate = Y.encodeStateAsUpdate(yDoc);
  const content = yDocToNodeJSON({ yDoc });
  const extractedTitle = findFirstH1Text(content);
  const title = extractedTitle.length > 0 ? extractedTitle : null;

  return {
    title,
    content,
    text: extractText(content),
    materializedYUpdate,
  };
}

const summarizeEvents = Effect.fn("MaterializerService.summarizeEvents")(function* (
  events: Arr.NonEmptyReadonlyArray<EventSchema.Record>,
) {
  const byType = {
    update: events.filter((event) => event.type === "update"),
    date: events.filter((event) => event.type === "date"),
  };

  return {
    first: Arr.headNonEmpty(events),
    last: Arr.lastNonEmpty(events),
    byType,
    latestDate: yield* getLatestDate(byType.date),
  };
});

const getLatestDate = Effect.fn("MaterializerService.getLatestDate")(function* (
  dateEvents: ReadonlyArray<EventSchema.Record>,
) {
  const latestDateEventOption = Arr.last(dateEvents);

  if (Option.isNone(latestDateEventOption)) return null;

  const payload = yield* EventSchema.decodeDatePayload(
    new Uint8Array(latestDateEventOption.value.payload),
  );

  return payload.date;
});

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
