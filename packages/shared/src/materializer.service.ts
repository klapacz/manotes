import { RecordSchema } from "./record.schema";
import { Array, Effect, Layer, Option, Order, pipe, Record, Context, Stream } from "effect";
import * as Y from "yjs";
import { DB } from "./db.service";
import { EventSchema } from "./event.schema";
import { EventRepo } from "./event.repo";
import { MaterializationCheckpointRepo } from "./materialization-checkpoint.repo";
import { BacklinkService } from "./materializer/backlink/service";
import { MaterializerAttrs } from "./materializer/attrs.service";
import { RecordRepo } from "./record.repo";
import { RecordDoc } from "./record/doc";
import { ProsemirrorMaterializer } from "./prosemirror-materializer.utils";
import { toLocalDateString } from "./temporal/utils";

const MAX_FETCHED_UNDONE_EVENTS = 100;

export class Service extends Context.Service<Service>()("Materializer.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;
    const eventRepo = yield* EventRepo.Service;
    const recordRepo = yield* RecordRepo.Service;
    const backlinkService = yield* BacklinkService.Service;
    const attrsService = yield* MaterializerAttrs.Service;
    const checkpointRepo = yield* MaterializationCheckpointRepo.Service;

    const materializeRecordUpTo = Effect.fn("MaterializerService.materializeRecordUpTo")(
      function* ({ recordId, upToLocalSeq }: { recordId: RecordSchema.Id; upToLocalSeq: number }) {
        const recordOption = yield* recordRepo.findById(recordId);

        if (Option.isSome(recordOption)) {
          const record = recordOption.value;

          const events = yield* eventRepo.findForRecordBetweenIds({
            recordId,
            afterLocalSeq: record.lastEventLocalSeq,
            upToLocalSeq,
          });

          if (!Array.isReadonlyArrayNonEmpty(events)) return;

          const summary = yield* summarizeEvents(events);

          const yDoc = yield* applyMaterializationUpdates(
            record.materializedYUpdate,
            summary.byType.update,
          );

          const materialized = buildMaterializedRecordFields({ yDoc });

          yield* recordRepo.updateById(recordId, {
            title: materialized.title,
            content: materialized.content,
            text: materialized.text,
            date: summary.latestDate ?? record.date,
            materializedYUpdate: materialized.materializedYUpdate,
            updatedAt: summary.last.createdAt,
            lastEventLocalSeq: upToLocalSeq,
          });

          yield* backlinkService.replaceForSourceRecord({
            sourceId: recordId,
            content: materialized.content,
          });

          yield* attrsService.materialize({ recordId: record.id, yDoc });

          yield* Effect.logInfo(`Materialized record up to event ${upToLocalSeq}`);

          return;
        }

        const events = yield* eventRepo.findForRecordBetweenIds({
          recordId,
          afterLocalSeq: 0,
          upToLocalSeq,
        });

        if (!Array.isReadonlyArrayNonEmpty(events)) return;

        const summary = yield* summarizeEvents(events);

        const yDoc = yield* applyMaterializationUpdates(null, summary.byType.update);

        const materialized = buildMaterializedRecordFields({
          yDoc,
        });

        const record = yield* recordRepo.create({
          id: recordId,
          title: materialized.title,
          content: materialized.content,
          text: materialized.text,
          date: summary.latestDate ?? toLocalDateString(summary.first.createdAt),
          materializedYUpdate: materialized.materializedYUpdate,
          createdAt: summary.first.createdAt,
          updatedAt: summary.last.createdAt,
          lastEventLocalSeq: upToLocalSeq,
        });

        yield* backlinkService.replaceForSourceRecord({
          sourceId: recordId,
          content: materialized.content,
        });

        yield* attrsService.materialize({ recordId: record.id, yDoc });

        yield* Effect.logInfo(`Materialized record up to event ${upToLocalSeq}`);
      },
    );

    // Both the CLI and worker use this batch path so record updates and checkpoint
    // advancement stay in the same transaction.
    const processNextBatch = Effect.fn("MaterializerService.processNextBatch")(function* (
      lastAppliedLocalSeq: number,
    ) {
      const stream = yield* eventRepo.streamAfterGlobalId(
        lastAppliedLocalSeq,
        MAX_FETCHED_UNDONE_EVENTS,
      );

      const nextBatch = yield* stream.pipe(
        Stream.filter(Array.isReadonlyArrayNonEmpty),
        Stream.runHead,
      );

      if (Option.isNone(nextBatch)) {
        return yield* Effect.fail(
          new Error("Event stream ended while materialization was running."),
        );
      }

      const batch = nextBatch.value;
      const newestLocalSeq = Array.lastNonEmpty(batch).localSeq;
      const targets = buildMaterializationTargets(batch);

      // Checkpoint advances only after a batch is fully materialized.
      // This makes replay idempotent after worker restarts.
      yield* db.transaction(
        Effect.gen(function* () {
          yield* Effect.forEach(
            targets,
            (target) => {
              return materializeRecordUpTo({
                recordId: target.recordId,
                upToLocalSeq: target.upToLocalSeq,
              });
            },
            {
              concurrency: 1,
              discard: true,
            },
          );

          yield* checkpointRepo.setLastAppliedLocalSeq(newestLocalSeq);
        }),
      );

      yield* Effect.logInfo(`Processed ${batch.length} events up to ${newestLocalSeq}`);

      return newestLocalSeq;
    });

    // The CLI drains the backlog observed at entry, then returns to write Markdown.
    // A batch may include newer events, but later writes do not extend the target.
    const catchUp = Effect.fn("MaterializerService.catchUp")(function* () {
      let lastAppliedLocalSeq = yield* checkpointRepo.getLastAppliedLocalSeq();
      const targetLocalSeq = yield* eventRepo.getMaxLocalSeq();
      yield* Effect.logInfo(
        `Catching up materializer from global cursor ${lastAppliedLocalSeq} to ${targetLocalSeq}`,
      );

      while (lastAppliedLocalSeq < targetLocalSeq) {
        lastAppliedLocalSeq = yield* processNextBatch(lastAppliedLocalSeq);
      }
    });

    // The app worker keeps following events instead of stopping after catch-up.
    const start = Effect.fn("MaterializerService.start")(function* () {
      let lastAppliedLocalSeq = yield* checkpointRepo.getLastAppliedLocalSeq();
      yield* Effect.logInfo(`Starting materializer at global cursor ${lastAppliedLocalSeq}`);

      while (true) {
        lastAppliedLocalSeq = yield* processNextBatch(lastAppliedLocalSeq);
      }
    });

    return {
      catchUp,
      start,
      // Callers saving an event can update the record and backlinks in the same transaction.
      materializeRecordUpTo,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(DB.Service.layer),
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(RecordRepo.Service.layer),
    Layer.provide(BacklinkService.Service.layer),
    Layer.provide(MaterializerAttrs.Service.layer),
    Layer.provide(MaterializationCheckpointRepo.Service.layer),
  );
}

const applyMaterializationUpdates = Effect.fn("MaterializerService.applyMaterializationUpdates")(
  function* (
    baseSnapshot: Uint8Array<ArrayBufferLike> | null,
    events: ReadonlyArray<{ payload: Uint8Array<ArrayBufferLike> }>,
  ) {
    const { doc: yDoc } = RecordDoc.make();

    if (baseSnapshot !== null) yield* Effect.sync(() => Y.applyUpdate(yDoc, baseSnapshot));

    yield* Effect.forEach(events, (event) => Effect.sync(() => Y.applyUpdate(yDoc, event.payload)));

    return yDoc;
  },
);

function buildMaterializedRecordFields({ yDoc }: { yDoc: Y.Doc }) {
  const materializedYUpdate = Y.encodeStateAsUpdate(yDoc);
  const content = ProsemirrorMaterializer.yDocToNodeJSON({ yDoc });
  const extractedTitle = ProsemirrorMaterializer.findFirstH1Text(content);
  const title = extractedTitle.length > 0 ? extractedTitle : null;

  return {
    title,
    content,
    text: ProsemirrorMaterializer.extractText(content),
    materializedYUpdate,
  };
}

const summarizeEvents = Effect.fn("MaterializerService.summarizeEvents")(function* (
  events: Array.NonEmptyReadonlyArray<EventRepo.Record>,
) {
  const byType = {
    update: events.filter((event) => event.type === "update"),
    date: events.filter((event) => event.type === "date"),
  };

  return {
    first: Array.headNonEmpty(events),
    last: Array.lastNonEmpty(events),
    byType,
    latestDate: yield* getLatestDate(byType.date),
  };
});

const getLatestDate = Effect.fn("MaterializerService.getLatestDate")(function* (
  dateEvents: ReadonlyArray<EventRepo.Record>,
) {
  const latestDateEventOption = Array.last(dateEvents);

  if (Option.isNone(latestDateEventOption)) return null;

  const payload = yield* EventSchema.decodeDatePayload(
    new Uint8Array(latestDateEventOption.value.payload),
  );

  return payload.date;
});

type MaterializationTarget = {
  recordId: RecordSchema.Id;
  upToLocalSeq: number;
};

function buildMaterializationTargets(
  events: ReadonlyArray<{ recordId: RecordSchema.Id; localSeq: number }>,
): ReadonlyArray<MaterializationTarget> {
  return pipe(
    events,
    // 1) Partition the batch by record so each record is handled once.
    Array.groupBy((event) => event.recordId),
    // 2) For each record, keep only the event with the highest localSeq.
    //    Materializing up to that localSeq implicitly covers earlier events.
    Record.map((recordEvents) => {
      return Array.max(
        recordEvents,
        pipe(
          Order.Number,
          Order.mapInput(
            (event: { recordId: RecordSchema.Id; localSeq: number }) => event.localSeq,
          ),
        ),
      );
    }),
    // 3) Convert the record back into explicit targets.
    Record.toEntries,
    Array.map(([recordId, event]) => ({
      recordId,
      upToLocalSeq: event.localSeq,
    })),
    // 4) Process targets in ascending event localSeq order for deterministic replay.
    Array.sort(
      pipe(
        Order.Number,
        Order.mapInput((record: MaterializationTarget) => record.upToLocalSeq),
      ),
    ),
  );
}

export * as Materializer from "./materializer.service";
