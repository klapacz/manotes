import { Effect, pipe, Schema, Option } from "effect";
import { DB, EventSchema, Tables } from ".";
import { eq } from "drizzle-orm";

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

    return {
      create,
      deleteById,
    };
  }),
}) {}
