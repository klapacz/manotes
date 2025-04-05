import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const note = sqliteTable("note", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => user.id)
    .notNull(),
  updatedAt: integer("updated_at").notNull(),
  content: blob("content", { mode: "json" }).$type<number[]>().notNull(),
  sv: blob("sv", { mode: "json" }).$type<number[]>().notNull(),
  dailyAt: text("daily_at"),
});
