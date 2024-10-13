import { Node as ProsemirrorNode } from "@tiptap/pm/model";

export namespace ProseUtils {
  export function findAllBacklinks(node: ProsemirrorNode) {
    const backlinks: string[] = [];

    node.descendants((node, pos) => {
      if (node.type.name === "backlink") {
        if (!node.attrs.id) {
          // TODO: more debugging info
          throw new Error("Backlink node has no id");
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
        if (!node.attrs.id) {
          // TODO: more debugging info
          throw new Error("Tag node has no id");
        }
        tags.push(node.attrs.id);
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
