import type { UnknownNodeJSON } from "../../node-json";

export function collectBacklinkTargetIds(node: UnknownNodeJSON): ReadonlyArray<string> {
  const backlinks = new Set<string>();

  visit(node, backlinks);

  return Array.from(backlinks);
}

function visit(node: UnknownNodeJSON, backlinks: Set<string>): void {
  if (node.type === "backlink") {
    const id = node.attrs?.id;
    const isDaily = node.attrs?.isDaily;

    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Backlink node has no id");
    }

    if (isDaily != null && typeof isDaily !== "boolean") {
      throw new Error("Backlink node has invalid isDaily flag");
    }

    backlinks.add(id);
  }

  for (const child of node.content ?? []) {
    visit(child, backlinks);
  }
}
