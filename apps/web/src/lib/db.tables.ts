import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export { notes, events, backlinks, materializationCheckpoint } from "@manotes/shared/db.tables";

export const recordings = sqliteTable("recordings", {
  path: text("path").primaryKey(),
  recordedAt: text("recordedAt").notNull(),
  mimeType: text("mimeType").notNull(),
  durationMs: integer("durationMs"),
  state: text("state", { enum: ["pending", "completed", "error"] }).notNull(),
  noteId: text("noteId").notNull(),
  intent: text("intent").notNull(),
});

export * as Tables from "./db.tables";
