import { RecordSchema } from "../../record.schema";
import { Schema } from "effect";
import {
  defineCommands as defineProsekitCommands,
  defineNodeSpec,
  insertNode,
} from "prosekit/core";

export const Attrs = Schema.Struct({
  id: RecordSchema.Id.annotate({ expected: "a nonempty string backlink id" }),
});

export type Attrs = typeof Attrs.Type;

export const decodeAttrs = Schema.decodeUnknownSync(Attrs);

export function define() {
  return defineNodeSpec<"backlink", Attrs>({
    name: "backlink",
    atom: true,
    group: "inline",
    attrs: {
      id: { validate: "string" },
    },
    inline: true,
    leafText: (node) => `[[${decodeAttrs(node.attrs).id}]]`,
    parseDOM: [
      {
        tag: "span[data-backlink-id]",
        getAttrs: (dom: HTMLElement): Attrs | false => {
          const attrs = { id: dom.getAttribute("data-backlink-id") };

          return Schema.is(Attrs)(attrs) ? attrs : false;
        },
      },
    ],
    toDOM(node) {
      const { id } = decodeAttrs(node.attrs);

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

export function defineCommands() {
  return defineProsekitCommands({
    insertBacklink: (attrs: Attrs) => {
      return insertNode({ type: "backlink", attrs });
    },
  });
}

export * as BacklinkSpec from "./spec";
