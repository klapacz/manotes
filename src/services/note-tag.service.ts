import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { ProseUtils } from "@/lib/prose.utils";
import { NoteTagRepo } from "./note-tag.repo";

export namespace NoteTagService {
  export async function recreateForNote({
    node,
    noteId,
  }: {
    node: ProsemirrorNode;
    noteId: string;
  }) {
    const tags = ProseUtils.findAllTags(node);
    await NoteTagRepo.deleteForNote({ noteId });

    if (tags.size > 0) {
      await NoteTagRepo.createMany(
        Array.from(tags).map((tag) => ({
          note_id: noteId,
          tag_id: tag,
        })),
      );
    }
  }
}
