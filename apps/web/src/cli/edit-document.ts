import type { Node } from "prosekit/pm/model";
import { Fragment } from "prosekit/pm/model";
import { Transform } from "prosekit/pm/transform";
import { MdParse } from "../lib/prosemirror/md/parse";
import { MdSerialize } from "../lib/prosemirror/md/serialize";

export type Edit =
  | {
      readonly kind: "replace";
      /** Literal Markdown, including displayed backlink labels. */
      readonly text: string;
      readonly with: string;
      /** Zero-based; omitted means exactly one match is required. */
      readonly occurrence?: number | "all";
    }
  | { readonly kind: "append"; readonly markdown: string };

/** Work on a private transform; a failed edit leaves the input document untouched. */
export function apply(doc: Node, edits: readonly Edit[], options: MdSerialize.Options = {}): Node {
  const tx = new Transform(doc);
  for (const edit of edits) {
    if (edit.kind === "append") append(tx, edit.markdown);
    else replace(tx, edit, options);
    tx.doc.check();
  }
  return tx.doc;
}

function append(tx: Transform, markdown: string): void {
  if (markdown.trim() === "") return;
  const content = MdParse.parse(markdown, tx.doc.type.schema).content;
  const first = tx.doc.firstChild;
  // Replace the empty placeholder instead of leaving a blank paragraph before the append.
  if (tx.doc.childCount === 1 && first?.type.name === "paragraph" && first.content.size === 0) {
    tx.replaceWith(0, tx.doc.content.size, content);
    return;
  }
  tx.insert(tx.doc.content.size, content);
}

function replace(
  tx: Transform,
  edit: Extract<Edit, { kind: "replace" }>,
  options: MdSerialize.Options,
): void {
  if (edit.text === edit.with) return;
  if (edit.text === "") throw new Error("Edit text must not be empty");
  // Unsupported nodes/marks fail here instead of disappearing in a round trip.
  const { markdown, blocks } = MdSerialize.withBlockSpans(tx.doc, options);
  const offsets = findMatches(markdown, edit);

  const runs: BlockRun[] = [];
  for (const offset of offsets) {
    const from = blockAt(blocks, offset);
    const to = blockAt(blocks, offset + edit.text.length - 1);
    const last = runs.at(-1);
    // Multiple matches in one block must be parsed together, not overwrite each other.
    if (last && from <= last.to) {
      last.to = to;
      last.offsets.push(offset);
    } else {
      runs.push({ from, to, offsets: [offset] });
    }
  }

  // Later replacements cannot move the positions of earlier blocks.
  for (const run of runs.reverse()) {
    const start = blocks[run.from];
    const end = blocks[run.to];
    if (!start || !end) throw new Error("Edit range is outside the document");
    let slice = markdown.slice(start.mdFrom, end.mdTo);
    for (const offset of run.offsets.toReversed()) {
      const at = offset - start.mdFrom;
      slice = slice.slice(0, at) + edit.with + slice.slice(at + edit.text.length);
    }

    const $doc = tx.doc.resolve(0);
    const from = $doc.posAtIndex(run.from);
    const to = $doc.posAtIndex(run.to + 1);
    const schema = tx.doc.type.schema;
    let content = Fragment.empty;
    if (slice.trim() !== "") {
      content = MdParse.parse(slice, schema).content;
    } else if (from === 0 && to === tx.doc.content.size) {
      // The app schema requires at least one block, even after deleting everything.
      content = Fragment.from(schema.node("paragraph"));
    }
    // Only touched blocks are reparsed. Their collapse state and custom numbering
    // may be lost; untouched nodes keep all their original attributes and content.
    tx.replaceWith(from, to, content);
  }
}

type BlockRun = { from: number; to: number; offsets: number[] };

function blockAt(blocks: readonly MdSerialize.BlockSpan[], offset: number): number {
  // The separator before a block belongs to that block's span.
  const index = blocks.findIndex((block) => block.mdTo > offset);
  if (index === -1) throw new Error(`Markdown offset ${offset} is outside the document`);
  return index;
}

function findMatches(markdown: string, edit: Extract<Edit, { kind: "replace" }>): number[] {
  const matches: number[] = [];
  let offset = markdown.indexOf(edit.text);
  while (offset !== -1) {
    matches.push(offset);
    offset = markdown.indexOf(edit.text, offset + edit.text.length);
  }

  if (matches.length === 0)
    throw new Error(`Expected a Markdown match, found 0 for ${JSON.stringify(edit.text)}`);
  if (edit.occurrence === "all") return matches;
  if (edit.occurrence !== undefined) {
    const match = Number.isInteger(edit.occurrence) ? matches[edit.occurrence] : undefined;
    if (match === undefined) throw new Error(`No Markdown match at occurrence ${edit.occurrence}`);
    return [match];
  }
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    throw new Error(`Expected exactly one Markdown match, found ${matches.length}`);
  }
  return [match];
}

export * as EditDocument from "./edit-document.ts";
