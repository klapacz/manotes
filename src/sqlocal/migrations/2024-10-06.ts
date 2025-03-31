import { nanoid } from "nanoid";
import type { Kysely, Migration } from "kysely";

// change `notes.id` type to `text`
// add backlinks table
export const Migration20241006: Migration = {
  async up(db: Kysely<any>) {
    // Create a new table with the same structure as the old one, but with id as text
    await db.schema
      .createTable("notes_new")
      .addColumn("id", "text", (cb) => cb.primaryKey())
      .addColumn("title", "text", (cb) => cb.notNull().defaultTo("Untitled"))
      .addColumn("content", "json", (cb) => cb.notNull())
      .execute();

    // Migrate all data
    const notes = await db.selectFrom("notes").selectAll().execute();
    if (notes.length !== 0) {
      const modified = notes.map((note) => ({
        ...note,
        content: JSON.stringify(note.content),
        id: nanoid(),
      }));

      await db.insertInto("notes_new").values(modified).execute();
    }

    // Drop the old table and rename the new one
    await db.schema.dropTable("notes").execute();
    await db.schema.alterTable("notes_new").renameTo("notes").execute();

    // Add backlinks table
    await db.schema
      .createTable("backlinks")
      .addColumn("source_id", "text", (cb) => cb.notNull())
      .addColumn("target_id", "text", (cb) => cb.notNull())
      .addForeignKeyConstraint(
        "backlinks_source_id_fk",
        ["source_id"],
        "notes",
        ["id"],
      )
      .addForeignKeyConstraint(
        "backlinks_target_id_fk",
        ["target_id"],
        "notes",
        ["id"],
      )
      .addPrimaryKeyConstraint("backlinks_pk", ["source_id", "target_id"])
      .execute();
  },

  async down(db: Kysely<any>) {
    throw new Error("Downgrade not supported");
  },
};
