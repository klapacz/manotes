import { nodeFromJSON } from "prosekit/core";
import { Fragment, type Node, type ResolvedPos } from "prosekit/pm/model";
import type { UnknownNodeJSON } from "../node-json";
import { getAppSchema } from "./app-schema";

/**
 * Creates an application-schema ProseMirror node from serialized JSON content.
 */
export function appNodeFromJSON(options: { content: UnknownNodeJSON; isDaily: boolean }): Node {
  return nodeFromJSON(options.content, { schema: getAppSchema(options.isDaily) });
}

/**
 * Produces a minimal heading node JSON payload for generated document content.
 */
export function createHeadingNode(level: number, text: string): UnknownNodeJSON {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

/**
 * Recursively rebuilds a node tree from the leaves up, applying the transform to
 * every node after its children have been processed.
 */
export function transformNode(node: Node, transform: (node: Node) => Node): Node {
  const content: Node[] = [];

  node.content.forEach((child) => {
    content.push(transformNode(child, transform));
  });

  const nextNode = node.content.size > 0 ? node.copy(Fragment.from(content)) : node;

  return transform(nextNode);
}

/**
 * Walks upward from a resolved position and returns the first ancestor that
 * matches the predicate, along with that node's document position.
 */
export function findParentNode(
  predicate: (node: Node) => boolean,
  $pos: ResolvedPos,
): { node: Node; pos: number } | undefined {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);

    if (predicate(node)) {
      return { node, pos: depth === 0 ? 0 : $pos.before(depth) };
    }
  }
}
