import type { Node } from "@tiptap/pm/model";
import { findParentNode } from "./find-parent-node";

export namespace BacklinkContext {
  type BlockInfo = { node: Node; pos: number };

  export function findBacklinkNode(
    doc: Node,
    targetId: string,
  ): BlockInfo | null {
    let result: BlockInfo | null = null;
    doc.descendants((node, pos) => {
      if (node.type.name === "backlink" && node.attrs.id === targetId) {
        result = { node, pos };
        return false; // Stop traversal
      }
    });
    return result;
  }

  /**
   * Extracts the relevant context surrounding a backlink node.
   * @param doc The entire document node
   * @param backlinkInfo Information about the backlink node, including its position
   * @returns A Node representing the smallest meaningful subset of the document that includes the backlink and its surrounding structure
   */
  export function extractBacklinkContext(
    fullDocument: Node,
    backlinkInfo: BlockInfo,
  ): Node {
    // Resolve the position of the backlink in the document
    const backlinkPosition = fullDocument.resolve(backlinkInfo.pos);

    // Find the nearest parent list node containing the backlink
    const immediateParentList = findParentNode(
      (node) => node.type.name === "list",
      backlinkPosition,
    );

    // If no parent list is found, return the entire document as context
    // TODO: do not return the entire document as context
    if (!immediateParentList) {
      return fullDocument;
    }

    // Try to find a higher-level parent list node
    const higherLevelParentList = findParentNode(
      (node) => node.type.name === "list",
      fullDocument.resolve(immediateParentList.pos),
    );

    // If no higher-level parent list is found, return the immediate parent list as context
    if (!higherLevelParentList) {
      return immediateParentList.node;
    }

    // If a higher-level parent list is found, we want to include it in the context
    // Check if the higher-level parent list has a paragraph as its first child
    const higherLevelParentContent = higherLevelParentList.node.content;
    const leadingParagraph =
      higherLevelParentContent.firstChild?.type.name === "paragraph"
        ? higherLevelParentContent.firstChild
        : null;

    // Prepare the content for the context
    // Include the leading paragraph (if it exists) and the immediate parent list
    const contextContent = leadingParagraph
      ? [leadingParagraph, immediateParentList.node]
      : [immediateParentList.node];

    // Create and return a new node of the same type as the higher-level parent list,
    // but only with the relevant content (leading paragraph and immediate parent list)
    return higherLevelParentList.node.type.create(
      higherLevelParentList.node.attrs,
      contextContent,
    );
  }
}
