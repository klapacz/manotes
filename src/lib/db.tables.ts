import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import * as EventSchema from "./event.schema";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isDaily: integer("isDaily", { mode: "boolean" }).notNull().default(false),
  materializedYUpdate: blob("materializedYUpdate", {
    mode: "buffer",
  }).$type<Uint8Array<ArrayBufferLike> | null>(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  lastEventId: integer("lastEventId").notNull().default(0),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: text("noteId").notNull(),
  isDaily: integer("isDaily", { mode: "boolean" }).notNull().default(false),
  type: text("type", {
    enum: EventSchema.Type.literals,
  }).notNull(),
  payload: blob("payload", { mode: "buffer" })
    .$type<(typeof EventSchema.Record.Encoded)["payload"]>()
    .notNull(),
  timestamp: text("timestamp").notNull(),
});

export const materializationCheckpoint = sqliteTable(
  "materialization_checkpoint",
  {
    id: integer("id").primaryKey(),
    lastAppliedEventId: integer("lastAppliedEventId").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
);
