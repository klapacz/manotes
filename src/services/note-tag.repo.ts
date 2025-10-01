import { db } from "@/sqlocal/client";

export namespace NoteTagRepo {
  export async function deleteForNote({ noteId }: { noteId: string }) {
    await db.deleteFrom("notes_tags").where("note_id", "=", noteId).execute();
  }

  export async function createMany(
    noteTags: { note_id: string; tag_id: string }[],
  ) {
    if (noteTags.length > 0) {
      await db.insertInto("notes_tags").values(noteTags).execute();
    }
  }
}
