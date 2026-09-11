import { defaultMarkdownSerializer, MarkdownSerializer } from "prosemirror-markdown";
import { Fragment, type Node } from "prosekit/pm/model";
import { numberOrderedLists } from "./number-ordered-lists";

export type Options = {
  readonly backlinkLabel?: (id: string) => string | undefined;
};

export type BlockSpan = { readonly mdFrom: number; readonly mdTo: number };

/** Export supported content. Tables, underline, and unknown nodes/marks throw.
 * Ordered items are numbered by position from one. Markdown does not retain
 * custom starting numbers, restarts, collapse state, or backlink display labels.
 */
export function serialize(doc: Node, options: Options = {}): string {
  return withBlockSpans(doc, options).markdown;
}

/** Contiguous top-level spans, including separators in the following block. */
export function withBlockSpans(
  doc: Node,
  options: Options = {},
): { readonly markdown: string; readonly blocks: readonly BlockSpan[] } {
  doc.check();
  // Normalize numbering on a copy, ignoring stored order attributes without
  // mutating the input document.
  const numberedDoc = numberOrderedLists(doc);
  const serializer = createSerializer(options);
  let markdown = "";
  const blocks: BlockSpan[] = [];
  // Serialize each top-level block separately to measure its output without
  // accessing library internals. The one-block doc uses the same app schema.
  numberedDoc.forEach((node, _, index) => {
    // These are string offsets, not ProseMirror positions. Record the start
    // before adding the separator so every character belongs to one span.
    const mdFrom = markdown.length;
    if (index) markdown += "\n";
    // The library returns no final block separator; give each block a newline.
    markdown += serializer.serialize(doc.copy(Fragment.from(node))) + "\n";
    blocks.push({ mdFrom, mdTo: markdown.length });
  });
  return { markdown, blocks };
}

function createSerializer(options: Options): MarkdownSerializer {
  const { nodes, marks } = defaultMarkdownSerializer;
  return new MarkdownSerializer(
    {
      // Delegate ordinary blocks, inline formatting, and escaping to the library.
      // Unmapped nodes and marks keep its default strict behavior and throw.
      paragraph: requireSerializer(nodes, "paragraph"),
      heading: requireSerializer(nodes, "heading"),
      blockquote: requireSerializer(nodes, "blockquote"),
      text: requireSerializer(nodes, "text"),
      image: requireSerializer(nodes, "image"),
      horizontalRule: requireSerializer(nodes, "horizontal_rule"),
      hardBreak: requireSerializer(nodes, "hard_break"),
      codeBlock(state, node) {
        const language: unknown = node.attrs.language ?? "";
        if (typeof language !== "string" || /[`\r\n]/.test(language)) {
          throw new Error("Code block language must be a string without backticks or newlines");
        }
        // A longer fence prevents backticks in the code from closing the block.
        // Render the body literally, preserving its whitespace rather than escaping it.
        const runs = node.textContent.match(/`+/g) ?? [];
        const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
        state.write(`${fence}${language}\n`);
        state.text(node.textContent, false);
        state.write(`\n${fence}`);
        state.closeBlock(node);
      },
      list(state, node) {
        const { kind, checked, order }: Readonly<Record<string, unknown>> = node.attrs;
        if (kind !== "toggle" && kind !== "ordered" && kind !== "task") {
          throw new Error(`Unsupported list kind: ${String(kind)}`);
        }
        if (kind === "task" && typeof checked !== "boolean") {
          throw new Error("Task checked state must be a boolean");
        }
        // Each FlatList node is one item. Its order was normalized above.
        const marker = kind === "ordered" ? `${String(order)}. ` : "- ";
        const task = kind === "task" ? `[${checked ? "x" : " "}] ` : "";
        // Only the first line gets the marker and checkbox. Continuation lines
        // indent by the list marker width, not by the checkbox text's width.
        state.wrapBlock(" ".repeat(marker.length), marker + task, node, () =>
          state.renderContent(node),
        );
      },
      backlink(state, node) {
        const id: unknown = node.attrs.id;
        if (typeof id !== "string" || id.length === 0) {
          throw new Error("Backlink id must be a nonempty string");
        }
        // Labels are display-only; the encoded note id is the link destination.
        const label = options.backlinkLabel?.(id) ?? id;
        // encodeURIComponent leaves these punctuation characters unescaped;
        // encode them too so ids cannot interfere with Markdown link syntax.
        const path = encodeURIComponent(id).replace(
          /[!'()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16)}`,
        );
        // Escape the label once, then write the assembled Markdown without
        // escaping its brackets and parentheses a second time.
        state.text(`[${state.esc(label)}](./${path}.md)`, false);
      },
    },
    {
      bold: requireSerializer(marks, "strong"),
      italic: requireSerializer(marks, "em"),
      code: requireSerializer(marks, "code"),
      link: requireSerializer(marks, "link"),
      // The library handles nesting and whitespace around our strike delimiters.
      strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    },
    { hardBreakNodeName: "hardBreak" },
  );
}

// Library maps have arbitrary string keys. Check lookups instead of asserting
// that an entry exists, so a missing mapping fails at serializer construction.
function requireSerializer<T>(serializers: Readonly<Record<string, T>>, name: string): T {
  const serializer = serializers[name];
  if (serializer === undefined) throw new Error(`Missing Markdown serializer: ${name}`);
  return serializer;
}

export * as MdSerialize from "./serialize.ts";
