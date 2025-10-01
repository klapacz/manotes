import { ProseUtils } from "@/lib/prose.utils";
import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { BacklinkRepo } from "./backlink.repo";

export namespace BacklinkService {
  export async function recreateForNote({
    node,
    noteId,
  }: {
    node: ProsemirrorNode;
    noteId: string;
  }) {
    const backlinks = ProseUtils.findAllBacklinks(node);

    await BacklinkRepo.deleteForNote({ noteId });

    if (backlinks.size > 0) {
      await BacklinkRepo.createMany(
        Array.from(backlinks).map((backlink) => ({
          source_id: noteId,
          target_id: backlink,
        })),
      );
    }
  }
}
