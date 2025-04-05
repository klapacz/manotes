import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { db } from "@/sqlocal/client";
import { ProseUtils } from "@/lib/prose.utils";

export namespace TagService {
  export async function recreateForNote({
    node,
    noteId,
  }: {
    node: ProsemirrorNode;
    noteId: string;
  }) {
    const tags = ProseUtils.findAllTags(node);
    await db.deleteFrom("notes_tags").where("note_id", "=", noteId).execute();

    if (tags.size > 0) {
      await db
        .insertInto("notes_tags")
        .values(
          Array.from(tags).map((tag) => ({
            note_id: noteId,
            tag_id: tag,
          })),
        )
        .execute();
    }
  }
}
