import type { Kysely, Migration } from "kysely";

export const Migration20241002: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("notes")
      .addColumn("id", "integer", (cb) => cb.primaryKey().autoIncrement())
      .addColumn("title", "text", (cb) => cb.notNull().defaultTo("Untitled"))
      .addColumn("content", "json", (cb) => cb.notNull())
      .execute();
  },
  async down(db: Kysely<any>) {
    await db.schema.dropTable("notes").execute();
  },
};
