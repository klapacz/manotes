import {
  createParseDomRules,
  listToDOM,
  listKeymap,
  createListPlugins,
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
} from "prosemirror-flat-list";

import { Node } from "@tiptap/core";
import type { NodeRange } from "@tiptap/pm/model";
import { listInputRules } from "./input-rule";
import { convertCommand } from "./utils";

export const flatListGroup = "flatList";

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

  renderHTML(node) {
    return listToDOM(node);
  },

  parseHTML() {
    return createParseDomRules();
  },

  addProseMirrorPlugins() {
    return createListPlugins({
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

  // TODO: Tab and Shift-Tab
  addKeyboardShortcuts() {
    listKeymap;
    return {
      Enter: () => {
        return this.editor.commands.listEnter();
      },
      Backspace: () => {
        return this.editor.commands.listBackspace();
      },
      Delete: () => {
        return this.editor.commands.listDelete();
      },
      "Mod-]": () => {
        return this.editor.commands.dedentList();
      },
      "Mod-[": () => {
        return this.editor.commands.indentList();
      },
    };
  },

  // TODO
  addInputRules() {
    return listInputRules;
  },
});

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

// /**
//  * A Remirror extension for creating lists. It's a simple wrapper around the API from `prosemirror-flat-list`.
//  *
//  * @public
//  */
// export class ListExtension extends NodeExtension {
//   static disableExtraAttributes = true;

//   get name() {
//     return "list" as const;
//   }

//   createTags() {
//     return [ExtensionTag.Block];
//   }

//   createNodeSpec(): NodeExtensionSpec {
//     // @ts-expect-error: incompatible type
//     return createListSpec();
//   }

//   createKeymap(): KeyBindings {
//     const bindings: KeyBindings = {};
//     for (const [key, command] of Object.entries(listKeymap)) {
//       bindings[key] = convertCommand(command);
//     }
//     bindings["Tab"] = alwaysTrue(bindings["Mod-]"]);
//     bindings["Shift-Tab"] = alwaysTrue(bindings["Mod-["]);
//     return bindings;
//   }

//   createExternalPlugins(): ProsemirrorPlugin[] {
//     return createListPlugins({ schema: this.store.schema });
//   }

//   createInputRules(): InputRule[] {
//     return listInputRules;
//   }

//   createCommands() {
//     return {
//       indentList: (props?: IndentListOptions) => {
//         return convertCommand(createIndentListCommand(props));
//       },
//       dedentList: (props?: DedentListOptions) => {
//         return convertCommand(createDedentListCommand(props));
//       },

//       unwrapList: (options?: UnwrapListOptions) => {
//         return convertCommand(createUnwrapListCommand(options));
//       },

//       wrapInList: (
//         getAttrs: ListAttributes | ((range: NodeRange) => ListAttributes | null)
//       ) => {
//         return convertCommand(
//           createWrapInListCommand<ListAttributes>(getAttrs)
//         );
//       },

//       moveList: (direction: "up" | "down") => {
//         return convertCommand(createMoveListCommand(direction));
//       },

//       splitList: () => convertCommand(createSplitListCommand()),

//       protectCollapsed: () => convertCommand(protectCollapsed),

//       toggleCollapsed: (props?: ToggleCollapsedOptions) => {
//         return convertCommand(createToggleCollapsedCommand(props));
//       },

//       toggleList: (attrs: ListAttributes) => {
//         return convertCommand(createToggleListCommand(attrs));
//       },
//     } as const;
//   }
// }
