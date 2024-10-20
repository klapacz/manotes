import type { ResolvedPos, Node } from "@tiptap/pm/model";

/**
 * @public
 */
export interface FindParentNodeResult {
  /**
   * The closest parent node that satisfies the predicate.
   */
  node: Node;

  /**
   * The position directly before the node.
   */
  pos: number;

  /**
   * The position at the start of the node.
   */
  start: number;

  /**
   * The depth of the node.
   */
  depth: number;
}

/**
 * Find the closest parent node that satisfies the predicate.
 *
 * Copied from https://github.com/prosekit/prosekit/blob/3c6a01c9998f27ea6149f138c52d8c376716ec3d/packages/core/src/utils/find-parent-node.ts#L6
 *
 * @public
 */
export function findParentNode(
  /**
   * The predicate to test the parent node.
   */
  predicate: (node: Node) => boolean,

  /**
   * The position to start searching from.
   */
  $pos: ResolvedPos,
): FindParentNodeResult | undefined {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);

    if (predicate(node)) {
      const pos = depth === 0 ? 0 : $pos.before(depth);
      const start = $pos.start(depth);
      return { node, pos, start, depth };
    }
  }
}
