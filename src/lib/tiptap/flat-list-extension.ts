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

import { Editor, Node } from "@tiptap/core";
import type {
  NodeRange,
  Schema,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { listInputRules } from "./input-rule";
import { convertCommand } from "./utils";
import { findParentNode } from "@tiptap/core";

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
        getAttrs:
          | ListAttributes
          | ((range: NodeRange) => ListAttributes | null),
      ) => {
        return convertCommand(
          createWrapInListCommand<ListAttributes>(getAttrs),
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
      //
      "Mod-Enter": ({ editor }) => {
        const toggled = toggleChecked(editor);
        if (toggled) {
          return true;
        }

        // If not a task list item, try to toggle the collapsed attribute
        return toggleCollapsed(editor);
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

/** Toggle checked attribute of task list item */
function toggleChecked(editor: Editor): boolean {
  const findTask = findParentNode(
    (node) => node.type.name === "list" && node.attrs.kind === "task",
  );

  // Find task list item, if not found, report not handled
  const found = findTask(editor.state.selection);
  if (!found) {
    return false;
  }

  // Update the checked attribute
  const newAttrs = {
    ...found.node.attrs,
    checked: !found.node.attrs.checked,
  };
  const tr = editor.state.tr.setNodeMarkup(found.pos, null, newAttrs);
  editor.view.dispatch(tr);

  return true; // Report handled
}

/** Toggle collapsed attribute of bullet list item */
function toggleCollapsed(editor: Editor): boolean {
  const findBullet = findParentNode(
    (node) => node.type.name === "list" && node.attrs.kind === "bullet",
  );

  // Find bullet list item, if not found, report not handled
  const found = findBullet(editor.state.selection);
  if (!found) {
    return false;
  }

  // Update the checked attribute
  const newAttrs = {
    ...found.node.attrs,
    collapsed: !found.node.attrs.collapsed,
  };
  const tr = editor.state.tr.setNodeMarkup(found.pos, null, newAttrs);
  editor.view.dispatch(tr);

  return true; // Report handled
}

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
        getAttrs:
          | ListAttributes
          | ((range: NodeRange) => ListAttributes | null),
      ) => ReturnType;
      moveList: (direction: "up" | "down") => ReturnType;
      splitList: () => ReturnType;
      protectCollapsed: () => ReturnType;
      toggleCollapsed: (props?: ToggleCollapsedOptions) => ReturnType;
      toggleList: (attrs: ListAttributes) => ReturnType;
    };
  }
}
