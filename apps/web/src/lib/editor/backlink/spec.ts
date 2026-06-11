import { defineCommands, defineNodeSpec, insertNode } from "prosekit/core";

export type BacklinkAttrs = { id: string };

export function defineBacklinkSpec() {
  return defineNodeSpec<"backlink", BacklinkAttrs>({
    name: "backlink",
    atom: true,
    group: "inline",
    attrs: {
      id: { validate: "string" },
    },
    inline: true,
    leafText: (node) => `[[${(node.attrs as BacklinkAttrs).id}]]`,
    parseDOM: [
      {
        tag: "span[data-backlink-id]",
        getAttrs: (dom: HTMLElement): BacklinkAttrs => ({
          id: dom.getAttribute("data-backlink-id") || "",
        }),
      },
    ],
    toDOM(node) {
      const { id } = node.attrs as BacklinkAttrs;

      return [
        "span",
        {
          "data-backlink": "",
          "data-backlink-id": id,
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
