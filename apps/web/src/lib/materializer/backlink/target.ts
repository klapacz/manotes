import type { UnknownNodeJSON } from "../../node-json";

export function collectBacklinkTargetIds(node: UnknownNodeJSON): ReadonlyArray<string> {
  const backlinks = new Set<string>();

  visit(node, backlinks);

  return Array.from(backlinks);
}

function visit(node: UnknownNodeJSON, backlinks: Set<string>): void {
  if (node.type === "backlink") {
    const id = node.attrs?.id;

    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Backlink node has no id");
    }

    backlinks.add(id);
  }

  for (const child of node.content ?? []) {
    visit(child, backlinks);
  }
}
