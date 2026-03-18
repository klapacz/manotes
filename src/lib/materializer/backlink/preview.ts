import { createHeadingNode } from "../../prosemirror/utils";
import type { UnknownNodeJSON } from "../../node-json";
import { extractBacklinkContexts } from "./context";

export function buildBacklinkPreviewDoc(options: {
  title: string;
  content: UnknownNodeJSON;
  targetId: string;
  isDaily: boolean;
}): {
  type: "doc";
  content: Array<UnknownNodeJSON>;
} {
  const contexts = extractBacklinkContexts({
    content: options.content,
    targetId: options.targetId,
    isDaily: options.isDaily,
  });

  return {
    type: "doc",
    content: [createHeadingNode(2, options.title), ...contexts],
  };
}
