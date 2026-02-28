import {
  Array as Arr,
  Effect,
  Option,
  Order,
  pipe,
  Record,
  Stream,
} from "effect";
import * as Y from "yjs";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as NoteRepo from "./note.repo";
import {
  findFirstH1Text,
  yDocToNodeJSON,
} from "./prosemirror-materializer.utils";

const MAX_FETCHED_UNDONE_EVENTS = 100;

export class Service extends Effect.Service<Service>()("Materializer.Service", {
  dependencies: [
    DB.Service.Default,
    EventRepo.Service.Default,
    NoteRepo.Service.Default,
    MaterializationCheckpointRepo.Service.Default,
  ],
  effect: Effect.gen(function* () {
    const db = yield* DB.Service;
    const eventRepo = yield* EventRepo.Service;
    const noteRepo = yield* NoteRepo.Service;
    const checkpointRepo = yield* MaterializationCheckpointRepo.Service;

    const materializeNoteUpTo = Effect.fn(
      "MaterializerService.materializeNoteUpTo",
    )(function* ({
      noteId,
      upToEventId,
    }: {
      noteId: string;
      upToEventId: number;
    }) {
      const noteOption = yield* noteRepo.findById(noteId);

      if (Option.isSome(noteOption)) {
        const note = noteOption.value;

        const events = yield* eventRepo.findUpdatesForNoteBetweenIds({
          noteId,
          afterId: note.lastEventId,
          upToEventId,
        });

        if (!Arr.isNonEmptyReadonlyArray(events)) return;

        const yDoc = yield* applyMaterializationUpdates(
          note.materializedYUpdate,
          events,
        );

        const materialized = buildMaterializedNoteFields({ yDoc });
        const lastEvent = Arr.lastNonEmpty(events);

        yield* noteRepo.updateById(noteId, {
          title: materialized.title,
          content: materialized.content,
          materializedYUpdate: materialized.materializedYUpdate,
          updatedAt: lastEvent.timestamp,
          lastEventId: upToEventId,
        });

        yield* Effect.logInfo(`Materialized note up to event ${upToEventId}`);
        return;
      }

      const events = yield* eventRepo.findUpdatesForNoteBetweenIds({
        noteId,
        afterId: 0,
        upToEventId,
      });

      if (!Arr.isNonEmptyReadonlyArray(events)) return;

      const yDoc = yield* applyMaterializationUpdates(null, events);

      const materialized = buildMaterializedNoteFields({ yDoc });
      const firstEvent = Arr.headNonEmpty(events);
      const lastEvent = Arr.lastNonEmpty(events);

      yield* noteRepo.create({
        id: noteId,
        title: materialized.title,
        content: materialized.content,
        materializedYUpdate: materialized.materializedYUpdate,
        createdAt: firstEvent.timestamp,
        updatedAt: lastEvent.timestamp,
        lastEventId: upToEventId,
      });

      yield* Effect.logInfo(`Materialized note up to event ${upToEventId}`);
    });

    const start = Effect.fn("MaterializerService.start")(function* () {
      // Checkpoint advances only after a batch is fully materialized.
      // This makes replay idempotent after worker restarts.
      const initialCursor = yield* checkpointRepo.getLastAppliedEventId();
      yield* Effect.logInfo(
        `Starting materializer at global cursor ${initialCursor}`,
      );

      yield* Effect.iterate(initialCursor, {
        while: () => true,
        body: (lastAppliedEventId) =>
          Effect.gen(function* () {
            const stream = yield* eventRepo.streamUpdatesAfterGlobalId(
              lastAppliedEventId,
              MAX_FETCHED_UNDONE_EVENTS,
            );

            const nextBatch = yield* stream.pipe(
              Stream.filter(Arr.isNonEmptyReadonlyArray),
              Stream.runHead,
            );

            if (Option.isNone(nextBatch)) {
              return lastAppliedEventId;
            }

            const batch = nextBatch.value;
            const newestEventId = Arr.lastNonEmpty(batch).id;
            const targets = buildMaterializationTargets(batch);

            yield* db.transaction(
              Effect.gen(function* () {
                yield* Effect.forEach(
                  targets,
                  (target) =>
                    materializeNoteUpTo({
                      noteId: target.noteId,
                      upToEventId: target.upToEventId,
                    }),
                  {
                    concurrency: 1,
                    discard: true,
                  },
                );

                yield* checkpointRepo.setLastAppliedEventId(newestEventId);
              }),
            );

            yield* Effect.logInfo(
              `Processed ${batch.length} events up to ${newestEventId}`,
            );
            return newestEventId;
          }),
      });
    });

    return {
      start,
    };
  }),
}) {}

const applyMaterializationUpdates = Effect.fn(
  "MaterializerService.applyMaterializationUpdates",
)(function* (
  baseSnapshot: Uint8Array<ArrayBufferLike> | null,
  events: ReadonlyArray<{ payload: Uint8Array<ArrayBufferLike> }>,
) {
  const yDoc = new Y.Doc();

  if (baseSnapshot !== null) {
    yield* Effect.sync(() => Y.applyUpdate(yDoc, baseSnapshot));
  }

  yield* Effect.forEach(events, (event) =>
    Effect.sync(() => Y.applyUpdate(yDoc, event.payload)),
  );

  return yDoc;
});

const FALLBACK_TITLE = "Untitled";

function buildMaterializedNoteFields({ yDoc }: { yDoc: Y.Doc }) {
  const materializedYUpdate = Y.encodeStateAsUpdate(yDoc);
  const content = yDocToNodeJSON(yDoc);
  const extractedTitle = findFirstH1Text(content);
  const title = extractedTitle.length > 0 ? extractedTitle : FALLBACK_TITLE;

  return {
    title,
    content,
    materializedYUpdate,
  };
}

type MaterializationTarget = {
  noteId: string;
  upToEventId: number;
};

function buildMaterializationTargets(
  events: ReadonlyArray<{ noteId: string; id: number }>,
): ReadonlyArray<MaterializationTarget> {
  return pipe(
    events,
    // 1) Partition the batch by note so each note is handled once.
    Arr.groupBy((event) => event.noteId),
    // 2) For each note, keep only the event with the highest id.
    //    Materializing up to that id implicitly covers earlier events.
    Record.map((noteEvents) =>
      Arr.max(
        noteEvents,
        pipe(
          Order.number,
          Order.mapInput((event: { noteId: string; id: number }) => event.id),
        ),
      ),
    ),
    // 3) Convert the record back into explicit targets.
    Record.toEntries,
    Arr.map(([noteId, event]) => ({
      noteId,
      upToEventId: event.id,
    })),
    // 4) Process targets in ascending event-id order for deterministic replay.
    Arr.sort(
      pipe(
        Order.number,
        Order.mapInput((record: MaterializationTarget) => record.upToEventId),
      ),
    ),
  );
}
