import type { UnknownNodeJSON } from "../../node-json";
import { decodeBacklinkAttrs } from "../../editor/backlink/spec";

export function collectBacklinkTargetIds(node: UnknownNodeJSON): ReadonlyArray<string> {
  const backlinks = new Set<string>();

  visit(node, backlinks);

  return Array.from(backlinks);
}

function visit(node: UnknownNodeJSON, backlinks: Set<string>): void {
  if (node.type === "backlink") {
    backlinks.add(decodeBacklinkAttrs(node.attrs).id);
  }

  for (const child of node.content ?? []) {
    visit(child, backlinks);
  }
}
