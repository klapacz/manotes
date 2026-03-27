import { Effect, pipe, Schema, Option, Stream } from "effect";
import * as DB from "./db.service";
import * as EventSchema from "./event.schema";
import * as Tables from "./db.tables";
import { and, asc, eq, gt, isNull, lte, max } from "drizzle-orm";
import { nanoid } from "nanoid";

const decodeAll = Schema.decode(Schema.Array(EventSchema.Record));

export class Service extends Effect.Service<Service>()("EventRepo.Service", {
  dependencies: [DB.Service.Default],
  effect: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("EventRepo.create")(function* (event: typeof EventSchema.Create.Type) {
      const encoded = yield* pipe(event, Schema.encode(EventSchema.Create));

      const record = yield* db.find((db) =>
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
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(EventSchema.Record)),
        }),
      );
    });

    const deleteByLocalSeq = Effect.fn("EventRepo.delete")(function* (localSeq: number) {
      const record = yield* db.find((db) =>
        db.delete(Tables.events).where(eq(Tables.events.localSeq, localSeq)).returning(),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(EventSchema.Record)),
        }),
      );
    });

    const findByEventId = Effect.fn("EventRepo.findByEventId")(function* (eventId: string) {
      const record = yield* db.find((db) =>
        db.select().from(Tables.events).where(eq(Tables.events.id, eventId)),
      );

      if (Option.isNone(record)) {
        return Option.none();
      }

      const decoded = yield* pipe(record.value, Schema.decode(EventSchema.Record));

      return Option.some(decoded);
    });

    const findPending = Effect.fn("EventRepo.findPending")(function* (limit: number) {
      const events = yield* db.query((db) =>
        db
          .select()
          .from(Tables.events)
          .where(and(eq(Tables.events.type, "update"), isNull(Tables.events.commitSeq)))
          .orderBy(asc(Tables.events.localSeq))
          .limit(limit),
      );

      return yield* pipe(events, decodeAll);
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

    const findUpdatesForNoteBetweenIds = Effect.fn("EventRepo.findUpdatesForNoteBetweenIds")(
      function* ({
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
                eq(Tables.events.type, "update"),
                gt(Tables.events.localSeq, afterLocalSeq),
                lte(Tables.events.localSeq, upToLocalSeq),
              ),
            )
            .orderBy(asc(Tables.events.localSeq)),
        );

        return yield* pipe(events, decodeAll);
      },
    );

    const streamHasPending = Effect.fn("EventRepo.streamHasPending")(function* () {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({ localSeq: Tables.events.localSeq })
          .from(Tables.events)
          .where(and(eq(Tables.events.type, "update"), isNull(Tables.events.commitSeq)))
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

      return stream.pipe(Stream.mapEffect(decodeAll));
    });

    const streamUpdatesAfterGlobalId = Effect.fn("EventRepo.streamUpdatesAfterGlobalId")(function* (
      afterLocalSeq: number,
      limit: number,
    ) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select()
          .from(Tables.events)
          .where(and(eq(Tables.events.type, "update"), gt(Tables.events.localSeq, afterLocalSeq)))
          .orderBy(asc(Tables.events.localSeq))
          .limit(limit),
      );

      return stream.pipe(Stream.mapEffect(decodeAll));
    });

    const markCommitted = Effect.fn("EventRepo.markCommitted")(function* ({
      eventId,
      commitSeq,
    }: {
      eventId: string;
      commitSeq: number;
    }) {
      const record = yield* db.find((db) =>
        db
          .update(Tables.events)
          .set({
            commitSeq,
          })
          .where(eq(Tables.events.id, eventId))
          .returning(),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(EventSchema.Record)),
        }),
      );
    });

    return {
      create,
      deleteByLocalSeq,
      findByEventId,
      getLastCommitSeq,
      findPending,
      findUpdatesForNote,
      findUpdatesForNoteBetweenIds,
      markCommitted,
      streamHasPending,
      streamUpdatesForNote,
      streamUpdatesAfterGlobalId,
    };
  }),
}) {}
