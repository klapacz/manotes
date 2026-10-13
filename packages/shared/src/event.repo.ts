import { Query, Cast, Type } from "effect-qb";
import { Array, Effect, Layer, Option, pipe, Schema, Context, Stream } from "effect";
import * as DB from "./db.service";
import type { EventSchema } from "./event.schema";
import { NoteSchema } from "./note.schema";
import * as Tables from "./db.tables";
import { nanoid } from "nanoid";
import { EffectOption } from "./effect/effect-option";

const IMPORT_BACKUP_BATCH_SIZE = 180;

export class Service extends Context.Service<Service>()("EventRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const countPending = Effect.fn("EventRepo.countPending")(function* () {
      // Acknowledgements update these rows in place; no separate status is stored.
      return yield* db
        .find(
          Query.select({ count: Cast.to(Query.count(Tables.events.localSeq), Type.int()) }).pipe(
            Query.from(Tables.events),
            Query.where(Query.isNull(Tables.events.commitSeq)),
          ),
        )
        .pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.count })));
    });

    const create = Effect.fn("EventRepo.create")(function* (event: EventSchema.Create) {
      yield* Schema.decodeEffect(NoteSchema.CreateId)(event.noteId);

      return yield* db
        .find(
          Query.insert(Tables.events, {
            type: event.type,
            noteId: event.noteId,
            payload: event.payload,
            createdAt: event.createdAt,
            id: event.id ?? nanoid(),
            commitSeq: event.commitSeq ?? null,
          }).pipe(Query.returning(Tables.events.columns)),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    const deleteByLocalSeq = Effect.fn("EventRepo.delete")(function* (localSeq: number) {
      return yield* db
        .find(
          Query.delete(Tables.events).pipe(
            Query.where(Query.eq(Tables.events.localSeq, localSeq)),
            Query.returning(Tables.events.columns),
          ),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    const findByEventId = Effect.fn("EventRepo.findByEventId")(function* (eventId: string) {
      return yield* db.find(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(Query.eq(Tables.events.id, eventId)),
        ),
      );
    });

    const findPending = Effect.fn("EventRepo.findPending")(function* (limit: number) {
      const events = yield* db.query(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(Query.isNull(Tables.events.commitSeq)),
          Query.orderBy(Tables.events.localSeq, "asc"),
          Query.limit(limit),
        ),
      );

      return events;
    });

    const listAllForBackup = Effect.fn("EventRepo.listAllForBackup")(function* () {
      const events = yield* db.query(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.orderBy(Tables.events.localSeq, "asc"),
        ),
      );

      return events;
    });

    const importBackupEvents = Effect.fn("EventRepo.importBackupEvents")(function* (
      events: ReadonlyArray<EventSchema.Create>,
    ) {
      if (events.length === 0) return;

      // Reject reserved IDs across the whole backup before inserting any events.
      for (const event of events) yield* Schema.decodeEffect(NoteSchema.CreateId)(event.noteId);

      yield* db.transaction(
        Effect.forEach(
          // Large backups can exceed SQLite's bound-variable limit if we try to
          // insert every row in a single VALUES statement.
          Array.chunksOf(events, IMPORT_BACKUP_BATCH_SIZE),
          (chunk) => {
            return db.query(
              Query.insert(Tables.events).pipe(
                Query.from(
                  DB.values(
                    Tables.events,
                    Array.map(chunk, (event) => ({
                      noteId: event.noteId,
                      type: event.type,
                      payload: event.payload,
                      createdAt: event.createdAt,
                      id: event.id ?? nanoid(),
                    })),
                  ),
                ),
                Query.returning(Tables.events.columns),
              ),
            );
          },
          {
            concurrency: 1,
            discard: true,
          },
        ),
      );
    });

    const getLastCommitSeq = Effect.fn("EventRepo.getLastCommitSeq")(function* () {
      const result = yield* db.find(
        Query.select({ commitSeq: Query.max(Tables.events.commitSeq) }).pipe(
          Query.from(Tables.events),
        ),
      );

      return pipe(
        result,
        Option.map((row) => row.commitSeq ?? 0),
        Option.getOrElse(() => 0),
      );
    });

    const getMaxLocalSeq = Effect.fn("EventRepo.getMaxLocalSeq")(function* () {
      return yield* db
        .find(
          Query.select({ localSeq: Query.max(Tables.events.localSeq) }).pipe(
            Query.from(Tables.events),
          ),
        )
        .pipe(Effect.map(Option.match({ onNone: () => 0, onSome: (row) => row.localSeq ?? 0 })));
    });

    const findUpdatesForNote = Effect.fn("EventRepo.findUpdatesForNote")(function* (
      noteId: string,
    ) {
      const events = yield* db.query(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(
            Query.and(
              Query.eq(Tables.events.noteId, noteId),
              Query.eq(Tables.events.type, "update"),
            ),
          ),
          Query.orderBy(Tables.events.localSeq, "asc"),
        ),
      );

      return events;
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
      const events = yield* db.query(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(
            Query.and(
              Query.eq(Tables.events.noteId, noteId),
              Query.gt(Tables.events.localSeq, afterLocalSeq),
              Query.lte(Tables.events.localSeq, upToLocalSeq),
            ),
          ),
          Query.orderBy(Tables.events.localSeq, "asc"),
        ),
      );

      return events;
    });

    const streamHasPending = Effect.fn("EventRepo.streamHasPending")(function* () {
      const stream = yield* db.reactiveQuery(
        Query.select({ localSeq: Tables.events.localSeq }).pipe(
          Query.from(Tables.events),
          Query.where(Query.isNull(Tables.events.commitSeq)),
          Query.orderBy(Tables.events.localSeq, "asc"),
          Query.limit(1),
        ),
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
      const stream = yield* db.reactiveQuery(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(
            Query.and(
              Query.eq(Tables.events.noteId, noteId),
              Query.eq(Tables.events.type, "update"),
              Query.gt(Tables.events.localSeq, afterLocalSeq),
            ),
          ),
          Query.orderBy(Tables.events.localSeq, "asc"),
        ),
      );

      return stream;
    });

    const streamAfterGlobalId = Effect.fn("EventRepo.streamAfterGlobalId")(function* (
      afterLocalSeq: number,
      limit: number,
    ) {
      const stream = yield* db.reactiveQuery(
        Query.select(Tables.events.columns).pipe(
          Query.from(Tables.events),
          Query.where(Query.gt(Tables.events.localSeq, afterLocalSeq)),
          Query.orderBy(Tables.events.localSeq, "asc"),
          Query.limit(limit),
        ),
      );

      return stream;
    });

    const markCommitted = Effect.fn("EventRepo.markCommitted")(function* ({
      eventId,
      commitSeq,
    }: {
      eventId: string;
      commitSeq: number;
    }) {
      return yield* db
        .find(
          Query.update(Tables.events, {
            commitSeq,
          }).pipe(
            Query.where(Query.eq(Tables.events.id, eventId)),
            Query.returning(Tables.events.columns),
          ),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
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
