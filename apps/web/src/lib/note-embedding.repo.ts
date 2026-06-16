import { Context, Effect, Layer, Option, pipe, Schema } from "effect";
import { and, eq, isNull, ne } from "drizzle-orm";
import * as DB from "./db.service";
import * as NoteEmbeddingSchema from "./note-embedding.schema";
import * as Tables from "./db.tables";

const decodeRecord = Schema.decodeEffect(NoteEmbeddingSchema.Record);
const decodeMetadata = Schema.decodeEffect(NoteEmbeddingSchema.Metadata);
const decodeMaterializedInputArray = Schema.decodeEffect(
  Schema.Array(NoteEmbeddingSchema.MaterializedInput),
);

export class Service extends Context.Service<Service>()("NoteEmbeddingRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const findMetadataByNoteId = Effect.fn("NoteEmbeddingRepo.findMetadataByNoteId")(function* (
      noteId: string,
    ) {
      const row = yield* db.find((db) =>
        db
          .select({
            noteId: Tables.noteEmbeddings.noteId,
            model: Tables.noteEmbeddings.model,
            dimensions: Tables.noteEmbeddings.dimensions,
            textHash: Tables.noteEmbeddings.textHash,
          })
          .from(Tables.noteEmbeddings)
          .where(eq(Tables.noteEmbeddings.noteId, noteId)),
      );

      return yield* Option.match(row, {
        onNone: () => Effect.succeedNone,
        onSome: (row) => decodeMetadata(row).pipe(Effect.asSome),
      });
    });

    const upsert = Effect.fn("NoteEmbeddingRepo.upsert")(function* (
      embedding: typeof NoteEmbeddingSchema.Upsert.Type,
    ) {
      const encoded = yield* pipe(embedding, Schema.encodeEffect(NoteEmbeddingSchema.Upsert));
      const record = yield* db.find((db) =>
        db
          .insert(Tables.noteEmbeddings)
          .values(encoded)
          .onConflictDoUpdate({
            target: Tables.noteEmbeddings.noteId,
            set: {
              model: encoded.model,
              dimensions: encoded.dimensions,
              textHash: encoded.textHash,
              embedding: encoded.embedding,
              updatedAt: encoded.updatedAt,
            },
          })
          .returning(),
      );

      return yield* Option.match(record, {
        onNone: () => new DB.NotFoundError(),
        onSome: decodeRecord,
      });
    });

    const deleteByNoteId = Effect.fn("NoteEmbeddingRepo.deleteByNoteId")(function* (
      noteId: string,
    ) {
      yield* db.query((db) =>
        db
          .delete(Tables.noteEmbeddings)
          .where(eq(Tables.noteEmbeddings.noteId, noteId))
          .returning({ noteId: Tables.noteEmbeddings.noteId }),
      );
    });

    const findMissingMaterializedInputs = Effect.fn(
      "NoteEmbeddingRepo.findMissingMaterializedInputs",
    )(function* (limit: number) {
      const rows = yield* db.query((db) =>
        db
          .select({
            id: Tables.notes.id,
            text: Tables.notes.text,
            updatedAt: Tables.notes.updatedAt,
          })
          .from(Tables.notes)
          .leftJoin(
            Tables.noteEmbeddings,
            and(
              eq(Tables.noteEmbeddings.noteId, Tables.notes.id),
              eq(Tables.noteEmbeddings.model, NoteEmbeddingSchema.MODEL_ID),
              eq(Tables.noteEmbeddings.dimensions, NoteEmbeddingSchema.DIMENSIONS),
            ),
          )
          .where(and(ne(Tables.notes.text, ""), isNull(Tables.noteEmbeddings.noteId)))
          .limit(limit),
      );

      return yield* decodeMaterializedInputArray(
        rows.map((row) => ({
          noteId: row.id,
          text: row.text,
          updatedAt: row.updatedAt,
        })),
      );
    });

    return {
      findMetadataByNoteId,
      upsert,
      deleteByNoteId,
      findMissingMaterializedInputs,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as NoteEmbeddingRepo from "./note-embedding.repo";
