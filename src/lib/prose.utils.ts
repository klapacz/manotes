import { Node as ProsemirrorNode } from "@tiptap/pm/model";

export namespace ProseUtils {
  export function findAllBacklinks(node: ProsemirrorNode) {
    const backlinks: string[] = [];

    node.descendants((node, pos) => {
      if (node.type.name === "backlink") {
        if (!node.attrs.id) {
          throw new Error("Backlink node has no id", {});
        }
        backlinks.push(node.attrs.id);
      }
    });

    return backlinks;
  }

  export function findAllTags(node: ProsemirrorNode) {
    const tags: string[] = [];

    node.descendants((node, pos) => {
      if (node.type.name === "tag") {
        tags.push(node.attrs.href);
      }
    });

    return tags;
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
