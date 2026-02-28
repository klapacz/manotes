import { Effect, pipe, Schema, Option, Stream } from "effect";
import * as DB from "./db.service";
import * as EventSchema from "./event.schema";
import * as Tables from "./db.tables";
import { and, asc, eq, gt, lte } from "drizzle-orm";

const decodeAll = Schema.decode(Schema.Array(EventSchema.Record));

export class Service extends Effect.Service<Service>()("EventRepo.Service", {
  dependencies: [DB.Service.Default],
  effect: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("EventRepo.create")(function* (
      event: typeof EventSchema.Create.Type,
    ) {
      const encoded = yield* pipe(event, Schema.encode(EventSchema.Create));

      const record = yield* db.find((db) =>
        db
          .insert(Tables.events)
          .values({
            type: encoded.type,
            noteId: encoded.noteId,
            isDaily: encoded.isDaily,
            payload: encoded.payload,
            timestamp: encoded.timestamp,
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

    const deleteById = Effect.fn("EventRepo.delete")(function* (id: number) {
      const record = yield* db.find((db) =>
        db.delete(Tables.events).where(eq(Tables.events.id, id)).returning(),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(EventSchema.Record)),
        }),
      );
    });

    const findUpdatesForNote = Effect.fn("EventRepo.findUpdatesForNote")(
      function* (noteId: string) {
        const events = yield* db.query((db) =>
          db
            .select()
            .from(Tables.events)
            .where(
              and(
                eq(Tables.events.noteId, noteId),
                eq(Tables.events.type, "update"),
              ),
            )
            .orderBy(asc(Tables.events.id)),
        );

        return yield* pipe(events, decodeAll);
      },
    );

    const findUpdatesForNoteBetweenIds = Effect.fn(
      "EventRepo.findUpdatesForNoteBetweenIds",
    )(function* ({
      noteId,
      afterId,
      upToEventId,
    }: {
      noteId: string;
      afterId: number;
      upToEventId: number;
    }) {
      const events = yield* db.query((db) =>
        db
          .select()
          .from(Tables.events)
          .where(
            and(
              eq(Tables.events.noteId, noteId),
              eq(Tables.events.type, "update"),
              gt(Tables.events.id, afterId),
              lte(Tables.events.id, upToEventId),
            ),
          )
          .orderBy(asc(Tables.events.id)),
      );

      return yield* pipe(events, decodeAll);
    });

    const streamUpdatesForNote = Effect.fn("EventRepo.streamUpdatesForNote")(
      function* ({ noteId, afterId }: { noteId: string; afterId: number }) {
        const stream = yield* db.reactiveQuery((db) =>
          db
            .select()
            .from(Tables.events)
            .where(
              and(
                eq(Tables.events.noteId, noteId),
                eq(Tables.events.type, "update"),
                gt(Tables.events.id, afterId),
              ),
            )
            .orderBy(asc(Tables.events.id)),
        );

        return stream.pipe(Stream.mapEffect(decodeAll));
      },
    );

    const streamUpdatesAfterGlobalId = Effect.fn(
      "EventRepo.streamUpdatesAfterGlobalId",
    )(function* (afterId: number, limit: number) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select()
          .from(Tables.events)
          .where(
            and(
              eq(Tables.events.type, "update"),
              gt(Tables.events.id, afterId),
            ),
          )
          .orderBy(asc(Tables.events.id))
          .limit(limit),
      );

      return stream.pipe(Stream.mapEffect(decodeAll));
    });

    return {
      create,
      deleteById,
      findUpdatesForNote,
      findUpdatesForNoteBetweenIds,
      streamUpdatesForNote,
      streamUpdatesAfterGlobalId,
    };
  }),
}) {}
