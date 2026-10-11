import { Array, Effect, Layer, Option, pipe, Schema, Context, Stream } from "effect";
import * as DB from "./db.service";
import * as EventSchema from "./event.schema";
import * as Tables from "./db.tables";
import { and, asc, count, eq, gt, isNull, lte, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import { EffectOption } from "./effect/effect-option";

const decodeRecord = Schema.decodeEffect(EventSchema.Record);

const decodeAll = Schema.decodeEffect(Schema.Array(EventSchema.Record));

const IMPORT_BACKUP_BATCH_SIZE = 180;

export class Service extends Context.Service<Service>()("EventRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const countPending = Effect.fn("EventRepo.countPending")(function* () {
      // Acknowledgements update these rows in place; no separate status is stored.
      return yield* db
        .find((db) =>
          db
            .select({ count: count().as("count") })
            .from(Tables.events)
            .where(isNull(Tables.events.commitSeq)),
        )
        .pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count })));
    });

    const create = Effect.fn("EventRepo.create")(function* (event: typeof EventSchema.Create.Type) {
      const encoded = yield* pipe(event, Schema.encodeEffect(EventSchema.Create));

      return yield* db
        .find((db) =>
          db
            .insert(Tables.events)
            .values({
              type: encoded.type,
              noteId: encoded.noteId,
              payload: encoded.payload,
              createdAt: encoded.createdAt,
              id: encoded.id ?? nanoid(),
              commitSeq: encoded.commitSeq ?? null,
            })
            .returning(),
        )
        .pipe(EffectOption.traverseOrElse(decodeRecord, () => new DB.NotFoundError()));
    });

    const deleteByLocalSeq = Effect.fn("EventRepo.delete")(function* (localSeq: number) {
      return yield* db
        .find((db) =>
          db.delete(Tables.events).where(eq(Tables.events.localSeq, localSeq)).returning(),
        )
        .pipe(EffectOption.traverseOrElse(decodeRecord, () => new DB.NotFoundError()));
    });

    const findByEventId = Effect.fn("EventRepo.findByEventId")(function* (eventId: string) {
      return yield* db
        .find((db) => db.select().from(Tables.events).where(eq(Tables.events.id, eventId)))
        .pipe(EffectOption.traverse(decodeRecord));
    });

    const findPending = Effect.fn("EventRepo.findPending")(function* (limit: number) {
      const events = yield* db.query((db) =>
        db
          .select()
          .from(Tables.events)
          .where(isNull(Tables.events.commitSeq))
          .orderBy(asc(Tables.events.localSeq))
          .limit(limit),
      );

      return yield* pipe(events, decodeAll);
    });

    const listAllForBackup = Effect.fn("EventRepo.listAllForBackup")(function* () {
      const events = yield* db.query((db) =>
        db.select().from(Tables.events).orderBy(asc(Tables.events.localSeq)),
      );

      return yield* pipe(events, decodeAll);
    });

    const importBackupEvents = Effect.fn("EventRepo.importBackupEvents")(function* (
      events: ReadonlyArray<typeof EventSchema.Create.Type>,
    ) {
      if (events.length === 0) return;

      const encodedEvents = yield* pipe(
        events,
        Schema.encodeEffect(Schema.Array(EventSchema.Create)),
      );

      yield* db.transaction(
        Effect.forEach(
          // Large backups can exceed SQLite's bound-variable limit if we try to
          // insert every row in a single VALUES statement.
          Array.chunksOf(encodedEvents, IMPORT_BACKUP_BATCH_SIZE),
          (chunk) =>
            db.query((db) =>
              db
                .insert(Tables.events)
                .values(
                  chunk.map((event) => ({
                    noteId: event.noteId,
                    type: event.type,
                    payload: event.payload,
                    createdAt: event.createdAt,
                    id: event.id ?? nanoid(),
                  })),
                )
                .returning(),
            ),
          {
            concurrency: 1,
            discard: true,
          },
        ),
      );
    });

    const getLastCommitSeq = Effect.fn("EventRepo.getLastCommitSeq")(function* () {
      const result = yield* db.find((db) =>
        db.select({ commitSeq: max(Tables.events.commitSeq).as("commitSeq") }).from(Tables.events),
      );

      return pipe(
        result,
        Option.map((row) => row.commitSeq ?? 0),
        Option.getOrElse(() => 0),
      );
    });

    const getMaxLocalSeq = Effect.fn("EventRepo.getMaxLocalSeq")(function* () {
      return yield* db
        .find((db) =>
          db.select({ localSeq: max(Tables.events.localSeq).as("localSeq") }).from(Tables.events),
        )
        .pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.localSeq ?? 0 })));
    });

    const findUpdatesForNote = Effect.fn("EventRepo.findUpdatesForNote")(function* (
      noteId: string,
    ) {
      const events = yield* db.query((db) =>
        db
          .select()
          .from(Tables.events)
          .where(and(eq(Tables.events.noteId, noteId), eq(Tables.events.type, "update")))
          .orderBy(asc(Tables.events.localSeq)),
      );

      return yield* pipe(events, decodeAll);
    });

    const findForNoteBetweenIds = Effect.fn("EventRepo.findForNoteBetweenIds")(function* ({
      noteId,
      afterLocalSeq,
      upToLocalSeq,
    }: {
      noteId: string;
      afterLocalSeq: number;
      upToLocalSeq: number;
    }) {
      const events = yield* db.query((db) =>
        db
          .select()
          .from(Tables.events)
          .where(
            and(
              eq(Tables.events.noteId, noteId),
              gt(Tables.events.localSeq, afterLocalSeq),
              lte(Tables.events.localSeq, upToLocalSeq),
            ),
          )
          .orderBy(asc(Tables.events.localSeq)),
      );

      return yield* pipe(events, decodeAll);
    });

    const streamHasPending = Effect.fn("EventRepo.streamHasPending")(function* () {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({ localSeq: Tables.events.localSeq })
          .from(Tables.events)
          .where(isNull(Tables.events.commitSeq))
          .orderBy(asc(Tables.events.localSeq))
          .limit(1),
      );

      return stream.pipe(Stream.map((events) => events.length > 0));
    });

    const streamUpdatesForNote = Effect.fn("EventRepo.streamUpdatesForNote")(function* ({
      noteId,
      afterLocalSeq,
    }: {
      noteId: string;
      afterLocalSeq: number;
    }) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select()
          .from(Tables.events)
          .where(
            and(
              eq(Tables.events.noteId, noteId),
              eq(Tables.events.type, "update"),
              gt(Tables.events.localSeq, afterLocalSeq),
            ),
          )
          .orderBy(asc(Tables.events.localSeq)),
      );

      return stream.pipe(Stream.mapEffect((events) => decodeAll(events)));
    });

    const streamAfterGlobalId = Effect.fn("EventRepo.streamAfterGlobalId")(function* (
      afterLocalSeq: number,
      limit: number,
    ) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select()
          .from(Tables.events)
          .where(gt(Tables.events.localSeq, afterLocalSeq))
          .orderBy(asc(Tables.events.localSeq))
          .limit(limit),
      );

      return stream.pipe(Stream.mapEffect((events) => decodeAll(events)));
    });

    const markCommitted = Effect.fn("EventRepo.markCommitted")(function* ({
      eventId,
      commitSeq,
    }: {
      eventId: string;
      commitSeq: number;
    }) {
      return yield* db
        .find((db) =>
          db
            .update(Tables.events)
            .set({
              commitSeq,
            })
            .where(eq(Tables.events.id, eventId))
            .returning(),
        )
        .pipe(EffectOption.traverseOrElse(decodeRecord, () => new DB.NotFoundError()));
    });

    return {
      create,
      deleteByLocalSeq,
      findByEventId,
      getLastCommitSeq,
      getMaxLocalSeq,
      importBackupEvents,
      findPending,
      countPending,
      findUpdatesForNote,
      findForNoteBetweenIds,
      listAllForBackup,
      markCommitted,
      streamHasPending,
      streamUpdatesForNote,
      streamAfterGlobalId,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as EventRepo from "./event.repo";
