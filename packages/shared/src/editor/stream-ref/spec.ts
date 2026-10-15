import { RecordSchema } from "../../record.schema";
import { Option, Schema } from "effect";
import {
  defineCommands as defineProsekitCommands,
  defineNodeSpec,
  insertNode,
} from "prosekit/core";
import { PaneSchema } from "../../record/pane.schema";
import { StreamSettings } from "../../record/stream-settings";

export const Attrs = PaneSchema.StreamSettings;

export type Attrs = typeof Attrs.Type;

export const decodeAttrs = Schema.decodeUnknownSync(Attrs);

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Attrs));

export function define() {
  return defineNodeSpec<"streamRef", Attrs>({
    name: "streamRef",
    atom: true,
    group: "inline",
    inline: true,
    attrs: {
      filter: {
        validate: Schema.decodeUnknownSync(Attrs.fields.filter),
      },
      sort: {
        default: "date",
        validate: Schema.decodeUnknownSync(Attrs.fields.sort),
      },
      view: {
        default: "full",
        validate: Schema.decodeUnknownSync(Attrs.fields.view),
      },
    },
    leafText: (node) => label(decodeAttrs(node.attrs)),
    parseDOM: [
      {
        tag: "span[data-stream-ref]",
        getAttrs: (dom: HTMLElement) => {
          return Option.getOrElse(
            decodeJson(dom.getAttribute("data-stream-ref")),
            () => false as const,
          );
        },
      },
    ],
    toDOM(node) {
      const attrs = decodeAttrs(node.attrs);

      return ["span", { "data-stream-ref": JSON.stringify(attrs) }, label(attrs)];
    },
  });
}

export function defineCommands() {
  return defineProsekitCommands({
    insertStreamRef: (attrs: Attrs) => insertNode({ type: "streamRef", attrs }),
  });
}

export function label(
  { filter, sort, view }: Attrs,
  recordLabel: (id: RecordSchema.Id) => string = (id) => id,
): string {
  return [
    StreamSettings.typeLabels[filter.type._tag],
    filter.search && `“${filter.search}”`,
    filter.backlinksTo && `Backlinks to ${recordLabel(filter.backlinksTo)}`,
    filter.linksFrom && `Links from ${recordLabel(filter.linksFrom)}`,
    filter.date,
    sort !== StreamSettings.defaults(filter.type).sort && sort,
    view !== "full" && view,
  ]
    .filter(Boolean)
    .join(" · ");
}

export * as StreamRefSpec from "./spec";
