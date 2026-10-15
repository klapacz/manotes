import { RecordSchema } from "../../record.schema";
import type { UnknownNodeJSON } from "../../node-json";
import { BacklinkSpec } from "../../editor/backlink/spec";

export function collectBacklinkTargetIds(node: UnknownNodeJSON): ReadonlyArray<RecordSchema.Id> {
  const backlinks = new Set<RecordSchema.Id>();

  visit(node, backlinks);

  return Array.from(backlinks);
}

function visit(node: UnknownNodeJSON, backlinks: Set<RecordSchema.Id>): void {
  if (node.type === "backlink") backlinks.add(BacklinkSpec.decodeAttrs(node.attrs).id);

  for (const child of node.content ?? []) {
    visit(child, backlinks);
  }
}
