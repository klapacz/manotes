import { Fragment, type Node, type ResolvedPos } from "@tiptap/pm/model";
import { findParentNode } from "./find-parent-node";

export namespace BacklinkContext {
  type BlockInfo = { node: Node; pos: number };

  /**
   * Finds all backlink nodes in the document that match the given target ID.
   * @param doc The document node to search
   * @param targetId The ID of the backlink to find
   * @returns An array of BlockInfo objects, sorted by their position in the document
   */
  export function findBacklinkNodes(doc: Node, targetId: string): BlockInfo[] {
    const results: BlockInfo[] = [];
    doc.descendants((node, pos) => {
      if (node.type.name === "backlink" && node.attrs.id === targetId) {
        results.push({ node, pos });
      }
    });
    return results.sort((a, b) => a.pos - b.pos);
  }

  /**
   * Extracts the relevant context surrounding a backlink node.
   * @param fullDocument The entire document node
   * @param backlinkInfo Information about the backlink node, including its position
   * @returns A Node representing the smallest meaningful subset of the document that includes the backlink and its surrounding structure.
   *          This can be a list structure, a heading, or the immediate parent node of the backlink.
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

    // If not in a heading or list, return the immediate parent node
    const immediateParent = findParentNode(
      (node) => node.type.isBlock,
      backlinkPosition,
    );

    if (immediateParent) {
      return immediateParent.node;
    }

    // If no parent node is found (which should be rare), return the backlink node itself
    return backlinkInfo.node;
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

  /**
   * Recursively processes the node tree and creates new nodes with the 'collapsed' attribute set to false for all list nodes.
   *
   * @param node The node to process
   * @returns A new node with 'collapsed' attribute set to false for all list nodes
   */
  export function uncollapseLists(node: Node): Node {
    if (node.type.name === "list") {
      const newAttrs = { ...node.attrs, collapsed: false };
      const newContent: Node[] = [];
      node.content.forEach((child) => {
        newContent.push(uncollapseLists(child));
      });
      return node.type.create(newAttrs, Fragment.from(newContent));
    } else if (node.content.size > 0) {
      const newContent: Node[] = [];
      node.content.forEach((child) => {
        newContent.push(uncollapseLists(child));
      });
      return node.copy(Fragment.from(newContent));
    }
    return node;
  }
}
