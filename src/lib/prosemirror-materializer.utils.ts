import { Option, pipe, Schema } from "effect";
import { createEditor, jsonFromNode } from "prosekit/core";
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { defineAppSchema } from "../editor.schema";
import type { UnknownNodeJSON } from "./node-json";

export function yDocToNodeJSON(opts: {
  yDoc: Y.Doc;
  isDaily: boolean;
}): UnknownNodeJSON {
  const xmlFragment = opts.yDoc.getXmlFragment("prosemirror");
  const rootNode = yXmlFragmentToProseMirrorRootNode(
    xmlFragment,
    createEditor({
      extension: defineAppSchema({ isDaily: opts.isDaily }),
    }).schema,
  );
  return jsonFromNode(rootNode);
}

export function findFirstH1Text(node: UnknownNodeJSON): string {
  const firstHeading = findFirstMatchingNode(node, (candidate) => {
    if (candidate.type !== "heading") return false;

    return getHeadingLevel(candidate.attrs) === 1;
  });

  if (!firstHeading) return "";
  return extractText(firstHeading).trim();
}

const decodeHeadingAttrs = Schema.decodeUnknownOption(
  Schema.Struct({ level: Schema.Number }),
  { exact: false },
);

function getHeadingLevel(attrs: UnknownNodeJSON["attrs"]): number | null {
  return pipe(
    decodeHeadingAttrs(attrs),
    Option.match({
      onNone: () => null,
      onSome: ({ level }) => level,
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

function extractText(node: UnknownNodeJSON): string {
  const ownText = node.text ?? "";
  const children = node.content ?? [];

  let nestedText = "";
  for (const child of children) {
    nestedText += extractText(child);
  }

  return `${ownText}${nestedText}`;
}
