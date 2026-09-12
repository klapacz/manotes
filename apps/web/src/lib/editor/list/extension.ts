import { Schema } from "effect";
import {
  defineKeymap,
  defineNodeSpec,
  type Extension,
  type PlainExtension,
  union,
} from "prosekit/core";
import { defineInputRule } from "prosekit/extensions/input-rule";
import {
  defineListCommands,
  defineListPlugins,
  defineListSerializer,
} from "prosekit/extensions/list";
import { defineDropIndicator, type DragEventHandler } from "prosekit/extensions/drop-indicator";
import { chainCommands, deleteSelection } from "prosekit/pm/commands";
import type { DOMOutputSpec, ProseMirrorNode, TagParseRule } from "prosekit/pm/model";
import {
  createDedentListCommand,
  createIndentListCommand,
  createListSpec,
  deleteCommand,
  enterCommand,
  findCheckboxInListItem,
  joinCollapsedListBackward,
  joinListUp,
  listToDOM,
  parseInteger,
  protectCollapsed,
  type ListAttributes,
  wrappingListInputRule,
} from "prosemirror-flat-list";

export interface AppListAttrs {
  kind?: "ordered" | "task" | "toggle";
  order?: number | null;
  checked?: boolean;
  collapsed?: boolean;
}

export const ResolvedAppListAttrs = Schema.Struct({
  kind: Schema.Literals(["bullet", "ordered", "task", "toggle"]),
  order: Schema.NullOr(Schema.Number),
  checked: Schema.Boolean,
  collapsed: Schema.Boolean,
});

export const decodeResolvedAppListAttrs = Schema.decodeUnknownSync(ResolvedAppListAttrs);

export function defineAppListSpec(): Extension<{
  Nodes: {
    list: AppListAttrs;
  };
}> {
  const spec = createListSpec();

  return defineNodeSpec<"list", AppListAttrs>({
    ...spec,
    attrs: {
      ...spec.attrs,
      // Upstream defaults to `bullet`. We canonicalize plain lists as `toggle`
      // so expand/collapse is the built-in behavior for all non-task lists.
      kind: {
        default: "toggle",
      },
    },
    parseDOM: createAppListParseDomRules(),
    toDOM: (node) => listToDOM({ node, getMarkers }),
    name: "list",
  });
}

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

function getMarkers(node: ProseMirrorNode): DOMOutputSpec[] {
  const attrs = decodeResolvedAppListAttrs(node.attrs);

  switch (attrs.kind) {
    case "task":
      return [["label", ["input", { type: "checkbox", checked: attrs.checked ? "" : undefined }]]];
    default:
      return [];
  }
}

function createAppListParseDomRules(): readonly TagParseRule[] {
  return [
    {
      tag: "div[data-list-kind]",
      getAttrs: (element: HTMLElement): AppListAttrs => ({
        kind: normalizeListKind(element.getAttribute("data-list-kind")),
        order: parseInteger(element.getAttribute("data-list-order")),
        checked: element.hasAttribute("data-list-checked"),
        collapsed: element.hasAttribute("data-list-collapsed"),
      }),
    },
    {
      tag: "div[data-list]",
      getAttrs: (element: HTMLElement): AppListAttrs => ({
        kind: normalizeListKind(element.getAttribute("data-list-kind")),
        order: parseInteger(element.getAttribute("data-list-order")),
        checked: element.hasAttribute("data-list-checked"),
        collapsed: element.hasAttribute("data-list-collapsed"),
      }),
    },
    {
      tag: "ul > li",
      getAttrs: (element: HTMLElement): AppListAttrs => {
        const checkbox = findCheckboxInListItem(element);

        if (checkbox) {
          return {
            kind: "task",
            checked: checkbox.hasAttribute("checked"),
          };
        }

        if (
          element.hasAttribute("data-task-list-item") ||
          element.getAttribute("data-list-kind") === "task"
        ) {
          return {
            kind: "task",
            checked:
              element.hasAttribute("data-list-checked") || element.hasAttribute("data-checked"),
          };
        }

        if (
          element.hasAttribute("data-toggle-list-item") ||
          element.getAttribute("data-list-kind") === "toggle"
        ) {
          return {
            kind: "toggle",
            collapsed: element.hasAttribute("data-list-collapsed"),
          };
        }

        if (element.firstChild?.nodeType === 3) {
          const textContent = element.firstChild.textContent;

          if (textContent && /^\[[\sx|]]\s{1,2}/.test(textContent)) {
            element.firstChild.textContent = textContent.replace(/^\[[\sx|]]\s{1,2}/, "");

            return {
              kind: "task",
              checked: textContent.startsWith("[x]"),
            };
          }
        }

        // Treat generic unordered-list HTML as `toggle` on import/paste.
        return {
          kind: "toggle",
        };
      },
    },
    {
      tag: "ol > li",
      getAttrs: (element: HTMLElement): AppListAttrs => ({
        kind: "ordered",
        order: parseInteger(element.getAttribute("data-list-order")),
      }),
    },
    {
      tag: ":is(ul, ol) > :is(ul, ol)",
      getAttrs: (element: HTMLElement): AppListAttrs => ({
        kind: element.tagName === "OL" ? "ordered" : "toggle",
      }),
    },
  ];
}

function parseOrderedListStart(value: string): number | null {
  const order = parseInteger(value);

  return order != null && order >= 2 ? order : null;
}

function normalizeListKind(kind: string | null): AppListAttrs["kind"] {
  switch (kind) {
    case "ordered":
    case "task":
    case "toggle":
      return kind;
    default:
      // Legacy/pasted `bullet` content is normalized here as well.
      return "toggle";
  }
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
