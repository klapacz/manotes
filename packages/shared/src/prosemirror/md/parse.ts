import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.mjs";
import { defaultMarkdownParser, MarkdownParser } from "prosemirror-markdown";
import type { Node, Schema } from "prosekit/pm/model";
import { NOTE_SCHEMA } from "../app-schema";
import { checkMarkdownTable } from "../../editor/table/spec";
import { numberOrderedLists } from "./number-ordered-lists";
import { decodeStreamRefAttrs } from "../../editor/stream-ref/spec";

/** Parse CommonMark plus strikethrough and tasks directly into the app schema. */
export function parse(markdown: string, schema: Schema = NOTE_SCHEMA): Node {
  const tokenizer = new MarkdownIt("commonmark", { html: false }).enable([
    "strikethrough",
    "table",
  ]);

  defineEmptyParagraphRule(tokenizer);

  // Runs inside parser.parse(), after markdown-it has produced inline tokens
  // but before MarkdownParser turns any tokens into ProseMirror nodes.
  tokenizer.core.ruler.after("inline", "app-schema", ({ tokens }) => {
    adaptListItems(tokens);
    tokens.splice(0, tokens.length, ...adaptTableCells(tokens));

    for (const token of tokens) {
      if (token.children) token.children = adaptRefs(token.children);
    }
  });

  const { image: _image, ...tokens } = defaultMarkdownParser.tokens;

  const parser = new MarkdownParser(schema, tokenizer, {
    ...tokens,
    link: { mark: "link", getAttrs: (token) => ({ href: token.attrGet("href") }) },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "tableRow" },
    th: { block: "tableHeaderCell", getAttrs: tableCellAttrs },
    td: { block: "tableCell", getAttrs: tableCellAttrs },
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
    stream_ref: {
      node: "streamRef",
      getAttrs: (token) => decodeStreamRefAttrs(JSON.parse(token.content)),
    },
  });

  const doc = parser.parse(markdown);
  doc.check();
  doc.descendants((node) => {
    if (node.type.name === "table") checkMarkdownTable(node);
  });

  // Number the finished tree by sibling position, ignoring source starts/restarts.
  return numberOrderedLists(doc);
}

// This reserved comment transports an empty block without enabling arbitrary HTML.
function defineEmptyParagraphRule(tokenizer: MarkdownIt): void {
  tokenizer.block.ruler.before(
    "paragraph",
    "empty_paragraph",
    (state, startLine, _endLine, silent) => {
      const indent = state.sCount[startLine];
      const begin = state.bMarks[startLine];
      const shift = state.tShift[startLine];
      const end = state.eMarks[startLine];

      if (indent === undefined || begin === undefined || shift === undefined || end === undefined) {
        return false;
      }

      if (indent - state.blkIndent >= 4) return false;
      const line = state.src.slice(begin + shift, end).trimEnd();
      const marker = "<!-- manotes:empty-paragraph -->";
      const task = state.parentType === "list" ? (/^(\[[ xX]\] )/.exec(line)?.[0] ?? "") : "";

      if (line.slice(task.length) !== marker) return false;

      if (silent) return true;
      const open = state.push("paragraph_open", "p", 1);
      open.map = [startLine, startLine + 1];
      const inline = state.push("inline", "", 0);
      inline.content = task;
      inline.children = [];
      inline.map = open.map;
      state.push("paragraph_close", "p", -1);
      state.line = startLine + 1;

      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
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
function adaptRefs(tokens: readonly Token[]): Token[] {
  const result: Token[] = [];
  let nextIndex = 0;

  for (const [index, token] of tokens.entries()) {
    if (index < nextIndex) continue;
    const href = token.type === "link_open" ? token.attrGet("href") : null;
    // Only ./<id>.md is a note ref. External links, parent paths, and
    // links with query strings or fragments keep their normal link tokens.
    const encodedId = /^\.\/([^/?#]+)\.md$/.exec(href ?? "")?.[1];
    const streamData = href?.startsWith("stream:") ? href.slice("stream:".length) : undefined;

    if (encodedId === undefined && streamData === undefined) {
      result.push(token);
      continue;
    }

    // Markdown links cannot nest. Consume through the next link_close, including
    // all label tokens, while leaving surrounding text and formatting untouched.
    const end = tokens.findIndex(
      (child, position) => position > index && child.type === "link_close",
    );

    if (end < 0) throw new Error("Unclosed ref");
    const ref = new Token(streamData === undefined ? "backlink" : "stream_ref", "", 0);

    if (streamData !== undefined) ref.content = decodeURIComponent(streamData);
    else if (encodedId !== undefined) ref.attrSet("id", decodeURIComponent(encodedId));

    result.push(ref);
    nextIndex = end + 1;
  }

  return result;
}

function tableCellAttrs(token: Token) {
  const align = token.attrGet("style")?.replace("text-align:", "") ?? null;

  return { align };
}

function adaptTableCells(tokens: readonly Token[]): Token[] {
  const result: Token[] = [];

  for (const token of tokens) {
    if (token.type === "th_close" || token.type === "td_close") {
      result.push(new Token("paragraph_close", "p", -1));
    }

    result.push(token);

    if (token.type === "th_open" || token.type === "td_open") {
      result.push(new Token("paragraph_open", "p", 1));
    }
  }

  return result;
}

export * as MdParse from "./parse.ts";
