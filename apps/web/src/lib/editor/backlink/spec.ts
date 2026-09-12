import { Schema } from "effect";
import { defineCommands, defineNodeSpec, insertNode } from "prosekit/core";

export const BacklinkAttrs = Schema.Struct({
  id: Schema.NonEmptyString.annotate({ expected: "a nonempty string backlink id" }),
});

export type BacklinkAttrs = typeof BacklinkAttrs.Type;

export const decodeBacklinkAttrs = Schema.decodeUnknownSync(BacklinkAttrs);

export function defineBacklinkSpec() {
  return defineNodeSpec<"backlink", BacklinkAttrs>({
    name: "backlink",
    atom: true,
    group: "inline",
    attrs: {
      id: { validate: "string" },
    },
    inline: true,
    leafText: (node) => `[[${decodeBacklinkAttrs(node.attrs).id}]]`,
    parseDOM: [
      {
        tag: "span[data-backlink-id]",
        getAttrs: (dom: HTMLElement): BacklinkAttrs | false => {
          const attrs = { id: dom.getAttribute("data-backlink-id") };

          return Schema.is(BacklinkAttrs)(attrs) ? attrs : false;
        },
      },
    ],
    toDOM(node) {
      const { id } = decodeBacklinkAttrs(node.attrs);

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
