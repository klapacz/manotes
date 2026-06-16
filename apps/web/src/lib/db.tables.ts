import { sqliteTable, text, integer, blob, primaryKey, index } from "drizzle-orm/sqlite-core";
import * as EventSchema from "./event.schema";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title"),
  content: text("content").notNull(),
  text: text("text").notNull(),
  date: text("date").notNull(),
  materializedYUpdate: blob("materializedYUpdate", {
    mode: "buffer",
  }).$type<Uint8Array<ArrayBufferLike> | null>(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  lastEventLocalSeq: integer("lastEventLocalSeq").notNull(),
});

export const events = sqliteTable("events", {
  localSeq: integer("localSeq").primaryKey({ autoIncrement: true }),
  noteId: text("noteId").notNull(),
  type: text("type", {
    enum: EventSchema.Type.literals,
  }).notNull(),
  payload: blob("payload", { mode: "buffer" })
    .$type<(typeof EventSchema.Record.Encoded)["payload"]>()
    .notNull(),
  createdAt: text("createdAt").notNull(),
  id: text("id").notNull().unique(),
  commitSeq: integer("commitSeq").unique(),
});

export const materializationCheckpoint = sqliteTable("materialization_checkpoint", {
  id: integer("id").primaryKey(),
  lastAppliedLocalSeq: integer("lastAppliedLocalSeq").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const backlinks = sqliteTable(
  "backlinks",
  {
    sourceId: text("sourceId").notNull(),
    targetId: text("targetId").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetId] }),
    index("backlinks_target_id_idx").on(table.targetId),
  ],
);

export const noteEmbeddings = sqliteTable(
  "note_embeddings",
  {
    noteId: text("noteId").primaryKey(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    textHash: text("textHash").notNull(),
    embedding: blob("embedding", { mode: "buffer" }).$type<Uint8Array<ArrayBufferLike>>().notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => [index("note_embeddings_model_idx").on(table.model)],
);
