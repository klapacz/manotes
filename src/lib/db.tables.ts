import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import * as EventSchema from "./event.schema";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  noteId: text("noteId").notNull(),
  type: text("type", {
    enum: EventSchema.Type.literals,
  }).notNull(),
  payload: blob("payload", { mode: "buffer" })
    .$type<(typeof EventSchema.Record.Encoded)["payload"]>()
    .notNull(),
  timestamp: text("timestamp").notNull(),
});
