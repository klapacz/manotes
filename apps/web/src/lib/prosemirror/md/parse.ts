import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.mjs";
import { defaultMarkdownParser, MarkdownParser } from "prosemirror-markdown";
import type { Node, Schema } from "prosekit/pm/model";
import { NOTE_SCHEMA } from "../app-schema";
import { numberOrderedLists } from "./number-ordered-lists";

/** Parse CommonMark plus strikethrough and tasks directly into the app schema. */
export function parse(markdown: string, schema: Schema = NOTE_SCHEMA): Node {
  const tokenizer = new MarkdownIt("commonmark", { html: false }).enable([
    "strikethrough",
    "table",
  ]);
  // Runs inside parser.parse(), after markdown-it has produced inline tokens
  // but before MarkdownParser turns any tokens into ProseMirror nodes.
  tokenizer.core.ruler.after("inline", "app-schema", ({ tokens }) => {
    adaptListItems(tokens);
    for (const token of tokens) {
      if (token.children) token.children = adaptBacklinks(token.children);
    }
  });
  const parser = new MarkdownParser(schema, tokenizer, {
    ...defaultMarkdownParser.tokens,
    // Ignore only the list wrappers. Their items still become app `list` nodes,
    // with kind and checked attributes supplied by adaptListItems below.
    bullet_list: { ignore: true },
    ordered_list: { ignore: true },
    list_item: {
      block: "list",
      getAttrs: (token) => ({
        kind: token.attrGet("kind"),
        checked: token.attrGet("checked") === "true",
      }),
    },
    // Reuse the library's parsing rules, mapping its names to our existing schema.
    code_block: { block: "codeBlock", noCloseToken: true },
    fence: {
      block: "codeBlock",
      getAttrs: (token) => ({ language: token.info }),
      noCloseToken: true,
    },
    hr: { node: "horizontalRule" },
    hardbreak: { node: "hardBreak" },
    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    backlink: { node: "backlink", getAttrs: (token) => ({ id: token.attrGet("id") }) },
    // Tables are recognized but deliberately have no mapping, so parsing fails
    // rather than quietly importing a table as unrelated paragraphs.
  });
  const doc = parser.parse(markdown);
  doc.check();
  // Number the finished tree by sibling position, ignoring source starts/restarts.
  return numberOrderedLists(doc);
}

// Markdown has list wrappers; the app has one list node per item. Keep a
// stack of wrappers only long enough to assign each item's kind.
function adaptListItems(tokens: readonly Token[]): void {
  const lists: Array<"toggle" | "ordered"> = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      lists.push(token.type === "ordered_list_open" ? "ordered" : "toggle");
      continue;
    }
    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
      lists.pop();
      continue;
    }
    if (token.type !== "list_item_open") continue;

    const list = lists.at(-1);
    if (!list) throw new Error("Markdown list item has no enclosing list");
    token.attrSet("kind", list);
    if (list === "ordered") continue;

    // A normal item starts with: list_item_open, paragraph_open, inline.
    // Read the inline source too: an escaped \[x] must remain ordinary text,
    // even though markdown-it has already removed the escape in the text token.
    const inline = tokens[index + 2];
    if (inline?.type !== "inline") continue;
    const task = /^\[([ xX])\](?: |$)/.exec(inline.content);
    const text = inline.children?.[0];
    if (!task || text?.type !== "text") continue;

    token.attrSet("kind", "task");
    token.attrSet("checked", String(task[1] === "x" || task[1] === "X"));
    // The checkbox is now an attribute, so remove its syntax from visible text.
    text.content = text.content.slice(task[0].length);
  }
}

// A backlink's label is display text, not stored content. Replace the entire
// link token range with an atom without changing the original inline tokens.
function adaptBacklinks(tokens: readonly Token[]): Token[] {
  const result: Token[] = [];
  let nextIndex = 0;
  for (const [index, token] of tokens.entries()) {
    if (index < nextIndex) continue;
    const href = token.type === "link_open" ? token.attrGet("href") : null;
    // Only ./<id>.md is a note reference. External links, parent paths, and
    // links with query strings or fragments keep their normal link tokens.
    const encodedId = /^\.\/([^/?#]+)\.md$/.exec(href ?? "")?.[1];
    if (encodedId === undefined) {
      result.push(token);
      continue;
    }

    // Markdown links cannot nest. Consume through the next link_close, including
    // all label tokens, while leaving surrounding text and formatting untouched.
    const end = tokens.findIndex(
      (child, position) => position > index && child.type === "link_close",
    );
    if (end < 0) throw new Error("Unclosed backlink");
    const backlink = new Token("backlink", "", 0);
    backlink.attrSet("id", decodeURIComponent(encodedId));
    result.push(backlink);
    nextIndex = end + 1;
  }
  return result;
}

export * as MdParse from "./parse.ts";
