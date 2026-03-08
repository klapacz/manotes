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
import { formatDailyNoteTitle } from "./daily-note";

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

        if (!Arr.isNonEmptyReadonlyArray(events)) return;

        const yDoc = yield* applyMaterializationUpdates(
          note.materializedYUpdate,
          events,
        );

        const materialized = buildMaterializedNoteFields({
          yDoc,
          noteId,
          isDaily: note.isDaily,
        });
        const lastEvent = Arr.lastNonEmpty(events);

        yield* noteRepo.updateById(noteId, {
          title: materialized.title,
          content: materialized.content,
          materializedYUpdate: materialized.materializedYUpdate,
          updatedAt: lastEvent.createdAt,
          lastEventLocalSeq: upToLocalSeq,
        });

        yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
        return;
      }

      const events = yield* eventRepo.findUpdatesForNoteBetweenIds({
        noteId,
        afterLocalSeq: 0,
        upToLocalSeq,
      });

      if (!Arr.isNonEmptyReadonlyArray(events)) return;

      const yDoc = yield* applyMaterializationUpdates(null, events);

      const firstEvent = Arr.headNonEmpty(events);
      const lastEvent = Arr.lastNonEmpty(events);
      const isDaily = firstEvent.isDaily;
      const materialized = buildMaterializedNoteFields({
        yDoc,
        noteId,
        isDaily,
      });

      yield* noteRepo.create({
        id: noteId,
        title: materialized.title,
        content: materialized.content,
        isDaily,
        materializedYUpdate: materialized.materializedYUpdate,
        createdAt: firstEvent.createdAt,
        updatedAt: lastEvent.createdAt,
        lastEventLocalSeq: upToLocalSeq,
      });

      yield* Effect.logInfo(`Materialized note up to event ${upToLocalSeq}`);
    });

    const start = Effect.fn("MaterializerService.start")(function* () {
      // Checkpoint advances only after a batch is fully materialized.
      // This makes replay idempotent after worker restarts.
      const initialCursor = yield* checkpointRepo.getLastAppliedLocalSeq();
      yield* Effect.logInfo(
        `Starting materializer at global cursor ${initialCursor}`,
      );

      yield* Effect.iterate(initialCursor, {
        while: () => true,
        body: (lastAppliedLocalSeq) =>
          Effect.gen(function* () {
            const stream = yield* eventRepo.streamUpdatesAfterGlobalId(
              lastAppliedLocalSeq,
              MAX_FETCHED_UNDONE_EVENTS,
            );

            const nextBatch = yield* stream.pipe(
              Stream.filter(Arr.isNonEmptyReadonlyArray),
              Stream.runHead,
            );

            if (Option.isNone(nextBatch)) {
              return lastAppliedLocalSeq;
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

            yield* Effect.logInfo(
              `Processed ${batch.length} events up to ${newestLocalSeq}`,
            );
            return newestLocalSeq;
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

export const FALLBACK_TITLE = "Untitled";

function buildMaterializedNoteFields({
  yDoc,
  noteId,
  isDaily,
}: {
  yDoc: Y.Doc;
  noteId: string;
  isDaily: boolean;
}) {
  const materializedYUpdate = Y.encodeStateAsUpdate(yDoc);
  const content = yDocToNodeJSON(yDoc);
  const extractedTitle = findFirstH1Text(content);
  // Daily note titles are deterministic from note id (date), so user edits in
  // the document body do not mutate the canonical daily title.
  const title = isDaily
    ? formatDailyNoteTitle(noteId)
    : extractedTitle.length > 0
      ? extractedTitle
      : FALLBACK_TITLE;

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
          Order.number,
          Order.mapInput(
            (event: { noteId: string; localSeq: number }) => event.localSeq,
          ),
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
        Order.number,
        Order.mapInput((record: MaterializationTarget) => record.upToLocalSeq),
      ),
    ),
  );
}
