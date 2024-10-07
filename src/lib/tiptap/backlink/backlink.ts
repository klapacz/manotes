import Mention from "@tiptap/extension-mention";
import { backlinkSuggestion } from "./suggestion";
import { mergeAttributes } from "@tiptap/core";

export const Backlink = Mention.extend({
  name: "backlink",
}).configure({
  HTMLAttributes: {
    class: "backlink",
  },
  renderHTML({ options, node }) {
    return [
      "a",
      mergeAttributes({ href: "#" }, options.HTMLAttributes),
      `${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  suggestion: backlinkSuggestion,
});
