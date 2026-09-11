import { Fragment, type Node } from "prosekit/pm/model";

/** Number adjacent ordered items from one, independently at each nesting level. */
export function numberOrderedLists(parent: Node): Node {
  if (parent.isLeaf) return parent;

  // Each recursive call owns a counter, so nested lists cannot advance this one.
  let order = 0;
  const children: Node[] = [];
  parent.forEach((child) => {
    const node = numberOrderedLists(child);
    // Any non-ordered sibling ends the current run, including tasks and toggles.
    if (node.type.name !== "list" || node.attrs.kind !== "ordered") {
      order = 0;
      children.push(node);
      return;
    }
    // Copy rather than edit attributes: callers may still hold the original doc.
    order += 1;
    children.push(node.type.create({ ...node.attrs, order }, node.content, node.marks));
  });
  return parent.copy(Fragment.fromArray(children));
}
