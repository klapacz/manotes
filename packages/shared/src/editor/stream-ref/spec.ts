import { Option, Schema } from "effect";
import { defineCommands, defineNodeSpec, insertNode } from "prosekit/core";
import { PaneSchema } from "../../note/pane.schema";

export const StreamRefAttrs = PaneSchema.StreamSettings;

export type StreamRefAttrs = typeof StreamRefAttrs.Type;

export const decodeStreamRefAttrs = Schema.decodeUnknownSync(StreamRefAttrs);

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(StreamRefAttrs));

export function defineStreamRefSpec() {
  return defineNodeSpec<"streamRef", StreamRefAttrs>({
    name: "streamRef",
    atom: true,
    group: "inline",
    inline: true,
    attrs: {
      filter: {
        validate: Schema.decodeUnknownSync(StreamRefAttrs.fields.filter),
      },
      sort: {
        default: "date",
        validate: Schema.decodeUnknownSync(StreamRefAttrs.fields.sort),
      },
      view: {
        default: "full",
        validate: Schema.decodeUnknownSync(StreamRefAttrs.fields.view),
      },
    },
    leafText: (node) => streamRefLabel(decodeStreamRefAttrs(node.attrs)),
    parseDOM: [
      {
        tag: "span[data-stream-ref]",
        getAttrs: (dom: HTMLElement) =>
          Option.getOrElse(decodeJson(dom.getAttribute("data-stream-ref")), () => false as const),
      },
    ],
    toDOM(node) {
      const attrs = decodeStreamRefAttrs(node.attrs);

      return ["span", { "data-stream-ref": JSON.stringify(attrs) }, streamRefLabel(attrs)];
    },
  });
}

export function defineStreamRefCommands() {
  return defineCommands({
    insertStreamRef: (attrs: StreamRefAttrs) => insertNode({ type: "streamRef", attrs }),
  });
}

export function streamRefLabel(
  { filter, sort, view }: StreamRefAttrs,
  noteLabel: (id: string) => string = (id) => id,
): string {
  return [
    filter.type === "pages" ? "Pages" : "Notes",
    filter.search && `“${filter.search}”`,
    filter.backlinksTo && `Backlinks to ${noteLabel(filter.backlinksTo)}`,
    filter.linksFrom && `Links from ${noteLabel(filter.linksFrom)}`,
    filter.date,
    sort !== (filter.type === "pages" ? "updated" : "date") && sort,
    view !== "full" && view,
  ]
    .filter(Boolean)
    .join(" · ");
}
