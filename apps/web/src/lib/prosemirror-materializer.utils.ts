import { Option, pipe, Schema } from "effect";
import { jsonFromNode } from "prosekit/core";
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import type { UnknownNodeJSON } from "./node-json";
import { NOTE_SCHEMA } from "./prosemirror/app-schema";
import { getProsemirrorXmlFragment } from "./prosemirror/yjs";

export function yDocToNodeJSON(opts: { yDoc: Y.Doc }): UnknownNodeJSON {
  const xmlFragment = getProsemirrorXmlFragment(opts.yDoc);
  const rootNode = yXmlFragmentToProseMirrorRootNode(xmlFragment, NOTE_SCHEMA);
  return jsonFromNode(rootNode);
}

export function findFirstH1Text(node: UnknownNodeJSON): string {
  const firstHeading = findFirstMatchingNode(node, (candidate) => {
    if (candidate.type !== "heading") return false;

    return getHeadingLevel(candidate.attrs) === 1;
  });

  if (!firstHeading) return "";
  return normalizeText(collectText(firstHeading));
}

export function extractText(node: UnknownNodeJSON): string {
  return normalizeText(collectText(node));
}

const HeadingAttrsSchema = Schema.Struct({
  level: Schema.optional(Schema.Number),
});

const decodeHeadingAttrs = Schema.decodeUnknownOption(HeadingAttrsSchema);

function getHeadingLevel(attrs: UnknownNodeJSON["attrs"]): number | null {
  return pipe(
    decodeHeadingAttrs(attrs),
    Option.match({
      onNone: () => null,
      onSome: ({ level }) => level ?? null,
    }),
  );
}

function findFirstMatchingNode(
  node: UnknownNodeJSON,
  predicate: (node: UnknownNodeJSON) => boolean,
): UnknownNodeJSON | null {
  if (predicate(node)) return node;

  const children = node.content;
  if (!children) return null;

  for (const child of children) {
    const match = findFirstMatchingNode(child, predicate);
    if (match) return match;
  }

  return null;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function collectText(node: UnknownNodeJSON): string {
  const ownText = node.text ?? "";
  const children = node.content ?? [];

  let nestedText = "";
  for (const child of children) {
    nestedText += collectText(child);
  }

  return `${ownText}${nestedText}`;
}
