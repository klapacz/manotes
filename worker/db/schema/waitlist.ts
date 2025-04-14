import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { UTCDate } from "@date-fns/utc";

export const waitlist = sqliteTable("waitlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  email: text("email").notNull().unique(),
  createdAt: text()
    .$defaultFn(() => new UTCDate().toISOString())
    .notNull(),
});
