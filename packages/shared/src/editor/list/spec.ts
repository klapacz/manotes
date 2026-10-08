import { Schema } from "effect";
import { defineNodeSpec, type Extension } from "prosekit/core";
import type { DOMOutputSpec, ProseMirrorNode, TagParseRule } from "prosekit/pm/model";
import {
  createListSpec,
  findCheckboxInListItem,
  listToDOM,
  parseInteger,
} from "prosemirror-flat-list";

export interface AppListAttrs {
  kind?: "ordered" | "task" | "toggle";
  order?: number | null;
  checked?: boolean;
  collapsed?: boolean;
}

export const ResolvedAppListAttrs = Schema.Struct({
  kind: Schema.Literals(["ordered", "task", "toggle"]),
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
        validate: Schema.decodeUnknownSync(ResolvedAppListAttrs.fields.kind),
      },
    },
    parseDOM: createAppListParseDomRules(),
    toDOM: (node) => listToDOM({ node, getMarkers }),
    name: "list",
  });
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
