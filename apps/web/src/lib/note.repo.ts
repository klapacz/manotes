import { Array, Effect, flow, Layer, Option, pipe, Schema, Context, Stream } from "effect";
import * as DB from "./db.service";
import * as NoteSchema from "./note.schema";
import * as Tables from "./db.tables";
import { and, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";

const decodeRecord = Schema.decodeEffect(NoteSchema.Record);
const decodeRecordArray = Schema.decodeEffect(Schema.Array(NoteSchema.Record));
const decodePreview = Schema.decodeEffect(NoteSchema.Preview);
const decodePreviewArray = Schema.decodeEffect(Schema.Array(NoteSchema.Preview));

export class Service extends Context.Service<Service>()("NoteRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("NoteRepo.create")(function* (note: typeof NoteSchema.Create.Type) {
      const encoded = yield* pipe(note, Schema.encodeEffect(NoteSchema.Create));

      const id = encoded.id ?? nanoid();

      const record = yield* db.find((db) =>
        db
          .insert(Tables.notes)
          .values({
            id,
            title: encoded.title,
            content: encoded.content,
            materializedYUpdate: encoded.materializedYUpdate ?? null,
            createdAt: encoded.createdAt,
            updatedAt: encoded.updatedAt,
            lastEventLocalSeq: encoded.lastEventLocalSeq ?? 0,
          })
          .returning(),
      );

      return yield* Option.match(record, {
        onNone: () => new DB.NotFoundError(),
        onSome: decodeRecord,
      });
    });

    const updateById = Effect.fn("NoteRepo.updateById")(function* (
      id: string,
      updates: typeof NoteSchema.Update.Type,
    ) {
      const encoded = yield* pipe(updates, Schema.encodeEffect(NoteSchema.Update));

      const record = yield* db.find((db) =>
        db.update(Tables.notes).set(encoded).where(eq(Tables.notes.id, id)).returning(),
      );

      return yield* Option.match(record, {
        onNone: () => new DB.NotFoundError(),
        onSome: decodeRecord,
      });
    });

    const findById = Effect.fn("NoteRepo.findById")(function* (id: string) {
      const record = yield* db.find((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      if (Option.isNone(record)) return Option.none();

      return yield* decodeRecord(record.value).pipe(Effect.asSome);
    });

    const getById = Effect.fn("NoteRepo.getById")(function* (id: string) {
      const note = yield* findById(id);

      if (Option.isNone(note)) return yield* new DB.NotFoundError();

      return note.value;
    });

    const reactiveFindById = Effect.fn("NoteRepo.reactiveFindById")(function* (id: string) {
      const stream = yield* db.reactiveQuery((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      return stream.pipe(
        Stream.mapEffect(
          flow(
            Array.head,
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: flow(decodeRecord, Effect.asSome),
            }),
          ),
        ),
      );
    });

    const list = Effect.fn("NoteRepo.list")(function* () {
      const records = yield* db.query((db) => db.select().from(Tables.notes));

      return yield* decodeRecordArray(records);
    });

    const reactiveList = Effect.fn("NoteRepo.reactiveList")(function* () {
      const stream = yield* db.reactiveQuery((db) => db.select().from(Tables.notes));

      return stream.pipe(Stream.mapEffect((n) => decodeRecordArray(n)));
    });

    const reactiveFindPreviewById = Effect.fn("NoteRepo.reactiveFindPreviewById")(function* (
      id: string,
    ) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
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
              onSome: flow(decodePreview, Effect.asSome),
            }),
          ),
        ),
      );
    });

    const reactiveSearchPreview = Effect.fn("NoteRepo.reactiveSearch")(function* (filter: string) {
      const stream = yield* db.reactiveQuery((db) => {
        const where = and(like(Tables.notes.title, `%${filter.trim()}%`));

        return db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            updatedAt: Tables.notes.updatedAt,
          })
          .from(Tables.notes)
          .limit(100)
          .where(where);
      });

      return stream.pipe(Stream.mapEffect((rows) => decodePreviewArray(rows)));
    });

    return {
      create,
      updateById,
      findById,
      getById,
      reactiveFindById,
      list,
      reactiveList,
      reactiveFindPreviewById,
      reactiveSearchPreview,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}
