import { db } from "@/sqlocal/client";
import type { NotesTable } from "@/sqlocal/schema";
import type { Insertable, Selectable } from "kysely";

export namespace NoteRepo {
  export type Record = Selectable<NotesTable>;

  /** Note: daily notes are not included in search results. */
  export async function search({
    title,
  }: {
    title: string;
  }): Promise<Record[]> {
    return db
      .selectFrom("notes")
      .where("title", "like", `%${title}%`)
      .where("daily_at", "is", null)
      .selectAll("notes")
      .execute();
  }

  export async function create(
    values: Insertable<NotesTable>,
  ): Promise<Record> {
    return db
      .insertInto("notes")
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  export async function createMany(
    values: Insertable<NotesTable>[],
  ): Promise<Record[]> {
    return db.insertInto("notes").values(values).returningAll().execute();
  }

  export async function update(
    id: string,
    values: Partial<Insertable<NotesTable>>,
  ): Promise<Record> {
    return db
      .updateTable("notes")
      .where("id", "=", id)
      .set(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  export async function find({
    id,
  }: {
    id: string;
  }): Promise<Record | undefined> {
    return db
      .selectFrom("notes")
      .selectAll("notes")
      .where("notes.id", "=", id)
      .executeTakeFirst();
  }

  export async function get({ id }: { id: string }): Promise<Record> {
    return db
      .selectFrom("notes")
      .selectAll("notes")
      .where("notes.id", "=", id)
      .executeTakeFirstOrThrow();
  }

  type ListOpts = {
    range: {
      start: string;
      end: string;
    };
  };

  export async function listDaily(opts: ListOpts): Promise<Record[]> {
    return db
      .selectFrom("notes")
      .orderBy("notes.title", "asc")
      .selectAll("notes")
      .where((eb) => {
        return eb.and([
          eb("daily_at", ">=", opts.range.start),
          eb("daily_at", "<=", opts.range.end),
        ]);
      })
      .execute();
  }

  export async function selectMetadata() {
    return db
      .selectFrom("notes")
      .select(["notes.id", "notes.vector_clock as vectorClock"])
      .execute();
  }

  export async function getWithBacklinks({
    noteId,
  }: {
    noteId: string;
  }): Promise<{
    note: Record;
    backlinks: Record[];
  }> {
    const [note, backlinks] = await Promise.all([
      db
        .selectFrom("notes")
        .where("notes.id", "=", noteId)
        .selectAll("notes")
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("backlinks")
        .where("backlinks.target_id", "=", noteId)
        .innerJoin(
          "notes as source_notes",
          "source_notes.id",
          "backlinks.source_id",
        )
        .orderBy("source_notes.daily_at", "desc")
        .selectAll("source_notes")
        .execute(),
    ]);

    return { note, backlinks };
  }
}
