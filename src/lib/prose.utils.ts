import { Node as ProsemirrorNode } from "@tiptap/pm/model";

export namespace ProseUtils {
  /**
   * @returns Set of backlink ids
   */
  export function findAllBacklinks(node: ProsemirrorNode): Set<string> {
    const backlinks = new Set<string>();

    node.descendants((node, pos) => {
      if (node.type.name === "backlink") {
        if (!node.attrs.id) {
          // TODO: more debugging info
          throw new Error("Backlink node has no id");
        }
        backlinks.add(node.attrs.id);
      }
    });

    return backlinks;
  }

  /**
   * @returns Set of tag ids
   */
  export function findAllTags(node: ProsemirrorNode): Set<string> {
    const tags = new Set<string>();

    node.descendants((node, pos) => {
      if (node.type.name === "tag") {
        if (!node.attrs.id) {
          // TODO: more debugging info
          throw new Error("Tag node has no id");
        }
        tags.add(node.attrs.id);
      }
    });

    return tags;
  }

  export function isNoteEmpty(node: ProsemirrorNode, title: string) {
    console.log(node.textContent);
    return node.textContent.trim() === title.trim();
  }

  export function getFirstHeadingContent(node: ProsemirrorNode) {
    let content: string | undefined;

    node.descendants((node, pos) => {
      if (node.type.name === "heading") {
        content = node.textContent;
      }
    });

    return content;
  }
}
