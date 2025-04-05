import { Node as ProsemirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { FlatListNode } from "@/lib/tiptap/flat-list-extension";
import { Link } from "@tiptap/extension-link";
import { Backlink } from "@/lib/tiptap/backlink/backlink";
import { Tag } from "@/lib/tiptap/tags/tag";

import { HeadingExtension } from "@/lib/tiptap/heading/heading";
import { DocExtension } from "@/lib/tiptap/doc/doc";
import { Editor } from "@tiptap/react";

export namespace ProseUtils {
  export function getEditorShema() {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          listItem: false,
          bulletList: false,
          orderedList: false,
          document: false,
          heading: false,
          history: false,
        }),
        HeadingExtension,
        Tag,
        Link,
        FlatListNode,
        Backlink,
        DocExtension,
      ],
    });

    return editor.schema;
  }

  /**
   * @returns Set of backlink ids
   */
  export function findAllBacklinks(node: ProsemirrorNode): Set<string> {
    const backlinks = new Set<string>();

    node.descendants((node) => {
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

    node.descendants((node) => {
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

    node.descendants((node) => {
      if (node.type.name === "heading") {
        content = node.textContent;
      }
    });

    return content;
  }
}
