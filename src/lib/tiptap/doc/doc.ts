import { Node } from "@tiptap/core";

export const DocExtension = Node.create({
  name: "doc",
  topNode: true,
  // The document must always have a heading
  content: "heading block+",
});
