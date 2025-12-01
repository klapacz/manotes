import { Effect, pipe, Schema, Option } from "effect";
import { DB, NoteSchema, Tables } from ".";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export class Service extends Effect.Service<Service>()("NoteRepo.Service", {
  dependencies: [DB.Service.Default],
  effect: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("NoteRepo.create")(function* (
      note: typeof NoteSchema.Create.Type,
    ) {
      const encoded = yield* pipe(note, Schema.encode(NoteSchema.Create));

      const id = encoded.id ?? nanoid();

      const record = yield* db.find((db) =>
        db
          .insert(Tables.notes)
          .values({
            id,
            title: encoded.title,
            content: encoded.content,
            createdAt: encoded.createdAt,
            updatedAt: encoded.updatedAt,
          })
          .returning(),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(NoteSchema.Record)),
        }),
      );
    });

    const updateById = Effect.fn("NoteRepo.updateById")(function* (
      id: string,
      updates: typeof NoteSchema.Update.Type,
    ) {
      const encoded = yield* pipe(updates, Schema.encode(NoteSchema.Update));

      const record = yield* db.find((db) =>
        db
          .update(Tables.notes)
          .set(encoded)
          .where(eq(Tables.notes.id, id))
          .returning(),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(NoteSchema.Record)),
        }),
      );
    });

    const getById = Effect.fn("NoteRepo.getById")(function* (id: string) {
      const record = yield* db.find((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      return yield* pipe(
        record,
        Option.match({
          onNone: () => new DB.NotFoundError(),
          onSome: (record) => pipe(record, Schema.decode(NoteSchema.Record)),
        }),
      );
    });

    const list = Effect.fn("NoteRepo.list")(function* () {
      const records = yield* db.query((db) => db.select().from(Tables.notes));

      return yield* Effect.forEach(records, (record) =>
        pipe(record, Schema.decode(NoteSchema.Record)),
      );
    });

    const reactiveList = Effect.fn("NoteRepo.reactiveList")(function* () {
      const stream = yield* db.reactiveQuery((db) =>
        db.select().from(Tables.notes),
      );

      return stream;
    });

    return {
      create,
      updateById,
      getById,
      list,
      reactiveList,
    };
  }),
}) {}
