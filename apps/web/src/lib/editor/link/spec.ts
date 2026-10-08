import { defineMarkSpec, union } from "prosekit/core";
import {
  defineLinkCommands,
  defineLinkInputRule,
  defineLinkEnterRule,
  defineLinkPasteRule,
} from "prosekit/extensions/link";

// ProseKit 0.22.3, packages/extensions/src/link/index.ts: retain link behavior
// with a Markdown-compatible href-only spec, removing target and rel.
export function defineAppLink() {
  return union(
    defineMarkSpec<"link", { href: string }>({
      name: "link",
      inclusive: false,
      attrs: { href: { validate: "string" } },
      parseDOM: [{ tag: "a[href]", getAttrs: (dom) => ({ href: dom.getAttribute("href") ?? "" }) }],
      toDOM: (mark) => ["a", { href: mark.attrs.href }, 0],
    }),
    defineLinkCommands(),
    defineLinkInputRule(),
    defineLinkEnterRule(),
    defineLinkPasteRule(),
  );
}
