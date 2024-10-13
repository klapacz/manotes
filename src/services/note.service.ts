import { ProseUtils } from "@/lib/prose.utils";
import { db } from "@/sqlocal/client";
import type { EditorEvents } from "@tiptap/core";

export namespace NoteService {
  export type UpdateParams = {
    editor: EditorEvents["update"]["editor"];
    noteId: string;
  };

  export async function update(params: UpdateParams) {
    const { editor, noteId } = params;

    const json = editor.getJSON();
    const firstHeading = ProseUtils.getFirstHeadingContent(editor.$doc.node);

    const backlinks = ProseUtils.findAllBacklinks(editor.$doc.node);

    // backlinks
    await db.deleteFrom("backlinks").where("source_id", "=", noteId).execute();

    if (backlinks.length) {
      await db
        .insertInto("backlinks")
        .values(
          backlinks.map((backlink) => ({
            source_id: noteId,
            target_id: backlink,
          }))
        )
        .execute();
    }

    // tags
    const tags = ProseUtils.findAllTags(editor.$doc.node);

    await db.deleteFrom("notes_tags").where("note_id", "=", noteId).execute();

    if (tags.length) {
      await db
        .insertInto("notes_tags")
        .values(
          tags.map((tag) => ({
            note_id: noteId,
            tag_id: tag,
          }))
        )
        .execute();
    }

    // note
    await db
      .updateTable("notes")
      .where("id", "=", noteId)
      .set({
        content: JSON.stringify(json),
        title: firstHeading ?? "Untitled",
      })
      .execute();
  }
}
