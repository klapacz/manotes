import { defineKeymap, type Extension, type PlainExtension, union } from "prosekit/core";
import { defineInputRule } from "prosekit/extensions/input-rule";
import {
  defineListCommands,
  defineListPlugins,
  defineListSerializer,
} from "prosekit/extensions/list";
import { defineDropIndicator, type DragEventHandler } from "prosekit/extensions/drop-indicator";
import { chainCommands, deleteSelection } from "prosekit/pm/commands";
import {
  createDedentListCommand,
  createIndentListCommand,
  deleteCommand,
  enterCommand,
  joinCollapsedListBackward,
  joinListUp,
  parseInteger,
  protectCollapsed,
  type ListAttributes,
  wrappingListInputRule,
} from "prosemirror-flat-list";

/**
 * App-owned list extension derived from ProseKit's bundled list extension.
 *
 * Differences from the upstream composition:
 * - `toggle` is the default non-task list kind; `bullet` is not used anymore.
 * - `- ` / `* ` input rules create `toggle` lists instead of `bullet` lists.
 * - pasted/imported bullet-like DOM is normalized to `toggle`.
 * - the list keymap intentionally does not bind `Mod-[` / `Mod-]`, so macOS
 *   browser back/forward shortcuts are left alone.
 * - the drop-indicator wiring is copied locally because ProseKit does not
 *   export its internal `defineListDropIndicator` helper.
 */
export function defineAppListExtension(): Extension {
  return union(
    defineListPlugins(),
    defineAppListKeymap(),
    defineAppListInputRules(),
    defineListCommands(),
    defineListSerializer(),
    defineAppListDropIndicator(),
  );
}

function defineAppListKeymap(): PlainExtension {
  const backspaceCommand = chainCommands(
    protectCollapsed,
    deleteSelection,
    joinListUp,
    joinCollapsedListBackward,
  );

  const dedentListCommand = createDedentListCommand();
  const indentListCommand = createIndentListCommand();

  return defineKeymap({
    Enter: enterCommand,
    Backspace: backspaceCommand,
    Delete: deleteCommand,
    // Keep indentation on Tab/Shift-Tab, but deliberately do not claim
    // Mod-[ / Mod-] so Cmd-[ remains browser back on macOS.
    Tab: indentListCommand,
    "Shift-Tab": dedentListCommand,
  });
}

function defineAppListInputRules(): Extension {
  return union(
    [
      // `- ` and `* ` used to create `bullet`; now they create collapsible toggles.
      wrappingListInputRule<ListAttributes>(/^\s?([*-])\s$/, {
        kind: "toggle",
        collapsed: false,
      }),
      wrappingListInputRule<ListAttributes>(/^\s?(\d+)\.\s$/, ({ match }) => ({
        kind: "ordered",
        collapsed: false,
        order: parseOrderedListStart(match[1] ?? ""),
      })),
      wrappingListInputRule<ListAttributes>(/^\s?\[([\sXx]?)]\s$/, ({ match }) => ({
        kind: "task",
        checked: ["x", "X"].includes(match[1] ?? ""),
        collapsed: false,
      })),
      wrappingListInputRule<ListAttributes>(/^\s?>>\s$/, {
        kind: "toggle",
        collapsed: false,
      }),
    ].map(defineInputRule),
  );
}

function parseOrderedListStart(value: string): number | null {
  const order = parseInteger(value);

  return order != null && order >= 2 ? order : null;
}

function defineAppListDropIndicator(): PlainExtension {
  return defineDropIndicator({
    onDrag,
  });
}

const onDrag: DragEventHandler = ({ view, pos }): boolean => {
  const slice = view.dragging?.slice;

  if (slice && slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1) {
    const node = slice.content.child(0);

    if (node.type.name === "list") {
      const $pos = view.state.doc.resolve(pos);

      if ($pos.parent.type.name === "list" && $pos.index() === 0) {
        return false;
      }
    }
  }

  return true;
};
