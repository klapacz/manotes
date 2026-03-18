import { pipe, Array } from "effect";
import type { Node, ResolvedPos } from "prosekit/pm/model";
import {
  appNodeFromJSON,
  findParentNode,
  transformNode,
} from "../../prosemirror/utils";
import type { UnknownNodeJSON } from "../../node-json";

export function extractBacklinkContexts(options: {
  content: UnknownNodeJSON;
  targetId: string;
  isDaily: boolean;
}): ReadonlyArray<UnknownNodeJSON> {
  const doc = appNodeFromJSON({
    content: options.content,
    isDaily: options.isDaily,
  });

  return pipe(
    findBacklinkNodes(doc, options.targetId),
    Array.map((backlink) => extractBacklinkContext(doc, backlink)),
    Array.dedupeWith((a, b) => a.key === b.key),
    Array.map((context) => uncollapseLists(context.node).toJSON()),
  );
}

type BacklinkInfo = { node: Node; pos: number };

/**
 * Finds all backlink nodes in the document that match the given target ID.
 * Results stay in document order so previews render predictably.
 */
function findBacklinkNodes(
  doc: Node,
  targetId: string,
): ReadonlyArray<BacklinkInfo> {
  const results: BacklinkInfo[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "backlink" && node.attrs.id === targetId) {
      results.push({ node, pos });
    }
  });

  return results.sort((left, right) => left.pos - right.pos);
}

type ContextInfo = { node: Node; key: string };

/**
 * Extracts the smallest useful context around a backlink.
 *
 * Preference order:
 * - list context, so nested backlinks keep their surrounding structure
 * - heading, when the backlink appears in a heading
 * - nearest block node, for normal paragraph content
 * - the backlink node itself as a final fallback
 */
function extractBacklinkContext(
  doc: Node,
  backlink: BacklinkInfo,
): ContextInfo {
  const $backlink = doc.resolve(backlink.pos);

  const listContext = extractBacklinkContextForList(doc, $backlink);
  if (listContext) return listContext;

  const heading = findParentNode(
    (node) => node.type.name === "heading",
    $backlink,
  );
  if (heading) return { node: heading.node, key: `block:${heading.pos}` };

  const block = findParentNode((node) => node.type.isBlock, $backlink);
  if (block) return { node: block.node, key: `block:${block.pos}` };

  return { node: backlink.node, key: `inline:${backlink.pos}` };
}

/**
 * Extracts context for a backlink inside a list.
 *
 * If the backlink lives in a nested list item, include the immediate parent list.
 * When that list item itself sits under a higher-level list item with a leading
 * paragraph, keep that paragraph too so the preview preserves the parent label.
 */
function extractBacklinkContextForList(
  doc: Node,
  $backlink: ResolvedPos,
): ContextInfo | undefined {
  const immediateParentList = findParentNode(
    (node) => node.type.name === "list",
    $backlink,
  );

  if (!immediateParentList) return undefined;

  const higherLevelParentList = findParentNode(
    (node) => node.type.name === "list",
    doc.resolve(immediateParentList.pos),
  );

  if (!higherLevelParentList) {
    return {
      node: immediateParentList.node,
      key: `list:${immediateParentList.pos}`,
    };
  }

  const leadingParagraph = getListLeadingParagraph(higherLevelParentList.node);

  return {
    node: higherLevelParentList.node.type.create(
      higherLevelParentList.node.attrs,
      leadingParagraph
        ? [leadingParagraph, immediateParentList.node]
        : [immediateParentList.node],
    ),
    key: `list:${higherLevelParentList.pos}:${immediateParentList.pos}`,
  };
}

function getListLeadingParagraph(listNode: Node): Node | null {
  const firstChild = listNode.content.firstChild;

  return firstChild?.type.name === "paragraph" ? firstChild : null;
}

/**
 * Rebuilds the extracted snippet with all list nodes expanded so previews do not
 * hide relevant nested content behind collapsed list state.
 */
function uncollapseLists(node: Node): Node {
  return transformNode(node, (currentNode) => {
    if (currentNode.type.name !== "list") return currentNode;

    return currentNode.type.create(
      { ...currentNode.attrs, collapsed: false },
      currentNode.content,
    );
  });
}
