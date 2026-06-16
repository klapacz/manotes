import { Schema } from "effect";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const DIMENSIONS = 384;

export const Record = Schema.Struct({
  noteId: Schema.String,
  model: Schema.String,
  dimensions: Schema.Number,
  textHash: Schema.String,
  embedding: Schema.Uint8Array,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type Record = typeof Record.Type;

export const Upsert = Schema.Struct({
  noteId: Schema.String,
  model: Schema.String,
  dimensions: Schema.Number,
  textHash: Schema.String,
  embedding: Schema.Uint8Array,
  updatedAt: Schema.DateTimeUtcFromString,
});

export const MaterializedInput = Schema.Struct({
  noteId: Schema.String,
  text: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type MaterializedInput = typeof MaterializedInput.Type;

export const Metadata = Schema.Struct({
  noteId: Schema.String,
  model: Schema.String,
  dimensions: Schema.Number,
  textHash: Schema.String,
});
export type Metadata = typeof Metadata.Type;

export const Stats = Schema.Struct({
  model: Schema.String,
  dimensions: Schema.Number,
  total: Schema.Number,
  embedded: Schema.Number,
  targetEmbedded: Schema.Union([Schema.Number, Schema.Null]),
});
export type Stats = typeof Stats.Type;

export * as NoteEmbeddingSchema from "./note-embedding.schema";
