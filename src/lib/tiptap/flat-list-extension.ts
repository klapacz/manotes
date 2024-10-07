import {
  createParseDomRules,
  listToDOM,
  listKeymap,
  createIndentListCommand,
  type IndentListOptions,
  type ListAttributes,
  type DedentListOptions,
  type UnwrapListOptions,
  type ToggleCollapsedOptions,
  createDedentListCommand,
  createMoveListCommand,
  createSplitListCommand,
  createUnwrapListCommand,
  createWrapInListCommand,
  protectCollapsed,
  createToggleListCommand,
  createToggleCollapsedCommand,
  enterCommand,
  backspaceCommand,
  deleteCommand,
  handleListMarkerMouseDown,
  defaultListClickHandler,
  createListRenderingPlugin,
  createListClipboardPlugin,
  createSafariInputMethodWorkaroundPlugin,
  flatListGroup,
} from "prosemirror-flat-list";

import { Node } from "@tiptap/core";
import type {
  NodeRange,
  Schema,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { listInputRules } from "./input-rule";
import { convertCommand } from "./utils";

export const FlatListNode = Node.create({
  name: "list",
  content: "block+",
  group: `${flatListGroup} block`,

  // TODO
  // definingForContent: true,
  // definingAsContext: false,

  addAttributes() {
    return {
      kind: {
        default: "bullet",
      },
      order: {
        default: null,
      },
      checked: {
        default: false,
      },
      collapsed: {
        default: false,
      },
    };
  },

  renderHTML({ node }) {
    const attrs = node.attrs as ListAttributes;

    // Return a marker for the bullet list, to make it collapsible
    if (attrs.kind === "bullet") {
      return listToDOM({
        node,
        getMarkers: () => {
          // Return an empty array to render an empty marker container element.
          return [];
        },
      });
    }

    return listToDOM({ node });
  },

  parseHTML() {
    return createParseDomRules();
  },

  addProseMirrorPlugins() {
    return customCreateListPlugins({
      schema: this.editor.schema,
    });
  },

  addCommands() {
    return {
      listEnter: () => {
        return convertCommand(enterCommand);
      },
      listBackspace: () => {
        return convertCommand(backspaceCommand);
      },
      listDelete: () => {
        return convertCommand(deleteCommand);
      },

      indentList: (props) => {
        return convertCommand(createIndentListCommand(props));
      },
      dedentList: (props) => {
        return convertCommand(createDedentListCommand(props));
      },
      unwrapList: (options) => {
        return convertCommand(createUnwrapListCommand(options));
      },
      wrapInList: (
        getAttrs: ListAttributes | ((range: NodeRange) => ListAttributes | null)
      ) => {
        return convertCommand(
          createWrapInListCommand<ListAttributes>(getAttrs)
        );
      },
      moveList: (direction) => {
        return convertCommand(createMoveListCommand(direction));
      },
      splitList: () => {
        return convertCommand(createSplitListCommand());
      },
      protectCollapsed: () => {
        return convertCommand(protectCollapsed);
      },
      toggleCollapsed: (props) => {
        return convertCommand(createToggleCollapsedCommand(props));
      },
      toggleList: (attrs: ListAttributes) => {
        return convertCommand(createToggleListCommand(attrs));
      },
    };
  },

  addKeyboardShortcuts() {
    listKeymap;
    return {
      // TODO: this was AI generated, I guess it can be simplified
      "Mod-Enter": ({ editor }) => {
        // Get the current editor state and view
        const { state, view } = editor;
        const { selection } = state;
        // Get the block range from the current selection
        const range = selection.$from.blockRange(selection.$to);
        // If there's no valid range, exit the command
        if (!range) return false;

        // Get the list node type from the schema
        const listType = this.type.schema.nodes.list;
        // Resolve the position at the start of the range
        const $pos = state.doc.resolve(range.start);
        // Get the node at the current depth (should be a list item)
        const listNode = $pos.node($pos.depth);

        // Check if the current node is a task list item
        if (listNode.type === listType && listNode.attrs.kind === "task") {
          // Create a new transaction
          const tr = state.tr;
          // Create new attributes, toggling the checked state
          const newAttrs = {
            ...listNode.attrs,
            checked: !listNode.attrs.checked,
          };
          // Set the new attributes for the list item
          // Note: range.start - 1 is used because the list item is one level up from the content
          tr.setNodeMarkup(range.start - 1, null, newAttrs);
          // Dispatch the transaction to update the editor state
          view.dispatch(tr);
          return true;
        }

        // If not a task list item, don't handle the command
        return false;
      },

      "Alt-ArrowUp": () => {
        return this.editor.commands.moveList("up");
      },
      "Alt-ArrowDown": () => {
        return this.editor.commands.moveList("down");
      },

      Enter: () => {
        return this.editor.commands.listEnter();
      },
      Backspace: () => {
        return this.editor.commands.listBackspace();
      },
      Delete: () => {
        return this.editor.commands.listDelete();
      },

      // We always return true, to prevent the browsers default "Tab" behavior
      "Shift-Tab": () => {
        this.editor.commands.dedentList();
        return true;
      },
      Tab: () => {
        this.editor.commands.indentList();
        return true;
      },
    };
  },

  addInputRules() {
    return listInputRules;
  },
});

function customCreateListPlugins({ schema }: { schema: Schema }) {
  return [
    customCreateListEventPlugin(),
    createListRenderingPlugin(),
    createListClipboardPlugin(schema),
    createSafariInputMethodWorkaroundPlugin(),
  ];
}

function customCreateListEventPlugin() {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) =>
          handleListMarkerMouseDown({
            view,
            event,
            onListClick: customListClickHandler,
          }),
      },
    },
  });
}

function customListClickHandler(node: ProseMirrorNode) {
  const attrs = node.attrs as ListAttributes;
  if (attrs.kind !== "bullet") {
    return defaultListClickHandler(node);
  }

  // make the bullet list collapsable
  const collapsable = node.childCount >= 2;
  const collapsed = collapsable ? !attrs.collapsed : false;
  return { ...attrs, collapsed };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    list: {
      listEnter: () => ReturnType;
      listBackspace: () => ReturnType;
      listDelete: () => ReturnType;

      indentList: (props?: IndentListOptions) => ReturnType;
      dedentList: (props?: DedentListOptions) => ReturnType;
      unwrapList: (options?: UnwrapListOptions) => ReturnType;
      wrapInList: (
        getAttrs: ListAttributes | ((range: NodeRange) => ListAttributes | null)
      ) => ReturnType;
      moveList: (direction: "up" | "down") => ReturnType;
      splitList: () => ReturnType;
      protectCollapsed: () => ReturnType;
      toggleCollapsed: (props?: ToggleCollapsedOptions) => ReturnType;
      toggleList: (attrs: ListAttributes) => ReturnType;
    };
  }
}
