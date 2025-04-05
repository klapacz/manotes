import { ProseUtils } from "@/lib/prose.utils";
import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { db } from "@/sqlocal/client";

export namespace BacklinkService {
  export async function recreateForNote({
    node,
    noteId,
  }: {
    node: ProsemirrorNode;
    noteId: string;
  }) {
    const backlinks = ProseUtils.findAllBacklinks(node);

    // backlinks
    await db.deleteFrom("backlinks").where("source_id", "=", noteId).execute();

    if (backlinks.size > 0) {
      await db
        .insertInto("backlinks")
        .values(
          Array.from(backlinks).map((backlink) => ({
            source_id: noteId,
            target_id: backlink,
          })),
        )
        .execute();
    }
  }
}
