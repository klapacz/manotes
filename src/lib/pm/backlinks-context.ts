import type { Node, ResolvedPos } from "@tiptap/pm/model";
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
   * @param fullDocument The entire document node
   * @param backlinkInfo Information about the backlink node, including its position
   * @returns A Node representing the smallest meaningful subset of the document that includes the backlink and its surrounding structure.
   *          This can be a list structure, a heading, a paragraph, or the entire document if no specific context is found.
   */
  export function extractBacklinkContext(
    fullDocument: Node,
    backlinkInfo: BlockInfo,
  ): Node {
    // Resolve the position of the backlink in the document
    const backlinkPosition = fullDocument.resolve(backlinkInfo.pos);

    // First, check if the backlink is within a list structure
    const foundInList = extractBacklinkContextForList(
      fullDocument,
      backlinkPosition,
    );

    if (foundInList) {
      return foundInList;
    }

    // If not in a list, check if the backlink is inside a heading
    const parentHeading = findParentNode(
      (node) => node.type.name === "heading",
      backlinkPosition,
    );

    if (parentHeading) {
      return parentHeading.node;
    }

    // If not in a heading, check if it's in a paragraph
    const parentParagraph = findParentNode(
      (node) => node.type.name === "paragraph",
      backlinkPosition,
    );

    if (parentParagraph) {
      return parentParagraph.node;
    }

    // If no specific context is found, return the entire document
    return fullDocument;
  }

  /**
   * Extracts the context for a backlink within a list structure.
   * This function handles nested lists and includes relevant parent content.
   *
   * @param fullDocument The entire document node
   * @param backlinkPosition The resolved position of the backlink in the document
   * @returns A Node representing the list context if found, or false if the backlink is not within a list
   */
  function extractBacklinkContextForList(
    fullDocument: Node,
    backlinkPosition: ResolvedPos,
  ): Node | false {
    // Find the nearest parent list node containing the backlink
    const immediateParentList = findParentNode(
      (node) => node.type.name === "list",
      backlinkPosition,
    );

    // If no parent list is found, return false
    if (!immediateParentList) {
      return false;
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
