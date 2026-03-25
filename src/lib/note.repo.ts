import { Effect, pipe, Schema, Option, Stream, Array, flow } from "effect";
import * as DB from "./db.service";
import * as NoteSchema from "./note.schema";
import * as Tables from "./db.tables";
import { and, eq, like } from "drizzle-orm";
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
            isDaily: encoded.isDaily ?? 0,
            materializedYUpdate: encoded.materializedYUpdate ?? null,
            createdAt: encoded.createdAt,
            updatedAt: encoded.updatedAt,
            lastEventLocalSeq: encoded.lastEventLocalSeq ?? 0,
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

    const findById = Effect.fn("NoteRepo.findById")(function* (id: string) {
      const record = yield* db.find((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      if (Option.isNone(record)) return Option.none();

      const decoded = yield* pipe(
        record.value,
        Schema.decode(NoteSchema.Record),
      );
      return Option.some(decoded);
    });

    const getById = Effect.fn("NoteRepo.getById")(function* (id: string) {
      const note = yield* findById(id);

      if (Option.isNone(note)) return yield* new DB.NotFoundError();

      return note.value;
    });

    const reactiveFindById = Effect.fn("NoteRepo.reactiveFindById")(function* (
      id: string,
    ) {
      const stream = yield* db.reactiveQuery((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      return stream.pipe(
        Stream.mapEffect(
          flow(
            Array.head,
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: flow(
                Schema.decode(NoteSchema.Record),
                Effect.map(Option.some),
              ),
            }),
          ),
        ),
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

      return stream.pipe(
        Stream.mapEffect((n) =>
          pipe(n, Schema.decode(Schema.Array(NoteSchema.Record))),
        ),
      );
    });

    const reactiveFindPreviewById = Effect.fn(
      "NoteRepo.reactiveFindPreviewById",
    )(function* (id: string) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            isDaily: Tables.notes.isDaily,
            updatedAt: Tables.notes.updatedAt,
          })
          .from(Tables.notes)
          .where(eq(Tables.notes.id, id)),
      );

      return stream.pipe(
        Stream.mapEffect(
          flow(
            Array.head,
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: flow(
                Schema.decode(NoteSchema.Preview),
                Effect.map(Option.some),
              ),
            }),
          ),
        ),
      );
    });

    const reactiveSearchPreview = Effect.fn("NoteRepo.reactiveSearch")(
      function* (filter: string) {
        const stream = yield* db.reactiveQuery((db) => {
          const where = and(
            eq(Tables.notes.isDaily, 0),
            like(Tables.notes.title, `%${filter.trim()}%`),
          );

          return db
            .select({
              id: Tables.notes.id,
              title: Tables.notes.title,
              isDaily: Tables.notes.isDaily,
              updatedAt: Tables.notes.updatedAt,
            })
            .from(Tables.notes)
            .limit(100)
            .where(where);
        });

        return stream.pipe(
          Stream.mapEffect(Schema.decode(Schema.Array(NoteSchema.Preview))),
        );
      },
    );

    return {
      create,
      updateById,
      findById,
      getById,
      reactiveFindById,
      list,
      reactiveList,
      reactiveFindPreviewById,
      reactiveSearchPreview: reactiveSearchPreview,
    };
  }),
}) {}
