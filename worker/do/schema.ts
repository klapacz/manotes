import { sqliteTable, text, blob } from "drizzle-orm/sqlite-core";

export type VectorClock = Record<string, number>;

export const note = sqliteTable("note", {
  id: text("id").primaryKey(),
  content: blob("content", { mode: "json" }).$type<number[]>().notNull(),
  sv: blob("sv", { mode: "json" }).$type<number[]>().notNull(),
  vectorClock: text("vector_clock", { mode: "json" })
    .$type<VectorClock>()
    .notNull(),
  dailyAt: text("daily_at"),
});
