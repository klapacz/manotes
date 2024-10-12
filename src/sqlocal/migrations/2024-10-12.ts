import type { Kysely, Migration } from "kysely";

export const Migration20241012: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("tags")
      .addColumn("id", "text", (cb) => cb.primaryKey())
      .addColumn("name", "text", (cb) => cb.notNull())
      .execute();

    // Add tags table
    await db.schema
      .createTable("notes_tags")
      .addColumn("note_id", "text", (cb) => cb.notNull())
      .addColumn("tag_id", "text", (cb) => cb.notNull())
      .addForeignKeyConstraint("notes_tags_note_id_fk", ["note_id"], "notes", [
        "id",
      ])
      .addForeignKeyConstraint("notes_tags_tag_id_fk", ["tag_id"], "tags", [
        "id",
      ])
      .addPrimaryKeyConstraint("notes_tags_pk", ["note_id", "tag_id"])
      .execute();

    // add notes.daily_at column
    await db.schema.alterTable("notes").addColumn("daily_at", "date").execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropTable("tags").execute();
    await db.schema.dropTable("notes_tags").execute();

    await db.schema.alterTable("notes").dropColumn("daily_at").execute();
  },
};
