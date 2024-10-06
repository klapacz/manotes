// This functions were used to migrate the toggle list to the bullet list

import type { JSONContent } from "@tiptap/core";
import type { ListAttributes } from "prosemirror-flat-list";

function migrateNodes(nodes: JSONContent[]): JSONContent[] {
  const content: JSONContent[] = [];

  for (const node of nodes) {
    content.push(migrateNode(node));
  }

  return content;
}

function migrateNode(node: JSONContent): JSONContent {
  // Migrate toggle to bullet
  if (node.type === "list" && node.attrs?.kind === "toggle") {
    return {
      ...node,
      type: "list",
      attrs: {
        ...node.attrs,
        kind: "bullet",
      } satisfies ListAttributes,
      content: node.content ? migrateNodes(node.content) : undefined,
    };
  } else if (node.content) {
    const content = migrateNodes(node.content);
    return { ...node, content };
  } else {
    return node;
  }
}
