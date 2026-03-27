import { defineCommands, defineNodeSpec, insertNode } from "prosekit/core";

export type BacklinkAttrs = { id: string; isDaily?: boolean };

export function defineBacklinkSpec() {
  return defineNodeSpec<"backlink", BacklinkAttrs>({
    name: "backlink",
    atom: true,
    group: "inline",
    attrs: {
      id: { validate: "string" },
      isDaily: { default: false, validate: "boolean" },
    },
    inline: true,
    leafText: (node) => `[[${(node.attrs as BacklinkAttrs).id}]]`,
    parseDOM: [
      {
        tag: "span[data-backlink-id]",
        getAttrs: (dom: HTMLElement): BacklinkAttrs => ({
          id: dom.getAttribute("data-backlink-id") || "",
          isDaily: dom.getAttribute("data-backlink-is-daily") === "true",
        }),
      },
    ],
    toDOM(node) {
      const { id, isDaily } = node.attrs as BacklinkAttrs;

      return [
        "span",
        {
          "data-backlink": "",
          "data-backlink-id": id,
          ...(isDaily ? { "data-backlink-is-daily": "true" } : {}),
        },
        `[[${id}]]`,
      ];
    },
  });
}

export function defineBacklinkCommands() {
  return defineCommands({
    insertBacklink: (attrs: BacklinkAttrs) => {
      return insertNode({ type: "backlink", attrs });
    },
  });
}
