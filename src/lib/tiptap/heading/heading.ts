import { mergeAttributes } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";

import { format, parse } from "date-fns";

export const HeadingExtension = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];

    let text = node.textContent;
    let content: string | number = 0;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const date = parse(text, "yyyy-MM-dd", new Date());
      content = format(date, "EEE, MMMM do, yyyy");
    }

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      content,
    ];
  },
});
