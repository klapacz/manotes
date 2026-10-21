import { AttrsSchema } from "../../attrs.schema";
import { RecordSchema } from "../../record.schema";
import { Array, identity, Match, Option, Result, Schema } from "effect";
import {
  defineCommands as defineProsekitCommands,
  defineNodeSpec,
  insertNode,
} from "prosekit/core";
import { PaneSchema } from "../../record/pane.schema";
import { Filters } from "../../record/filters";
import { StreamSettings } from "../../record/stream-settings";

export const Attrs = PaneSchema.StreamSettings;

export type Attrs = typeof Attrs.Type;

export type Label = Filters.Label;

export const Label = Filters.Label;

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
    leafText: (node) => renderLabels(labels(decodeAttrs(node.attrs))),
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

      return ["span", { "data-stream-ref": JSON.stringify(attrs) }, renderLabels(labels(attrs))];
    },
  });
}

export function defineCommands() {
  return defineProsekitCommands({
    insertStreamRef: (attrs: Attrs) => insertNode({ type: "streamRef", attrs }),
  });
}

export function labels(
  settings: Attrs,
  registry: Filters.Registry = Filters.builtin,
): readonly Label[] {
  const [recognized, otherFilters] = Array.partition(settings.filter, (expression) => {
    return expressionLabel(expression, registry);
  });

  const filters = Match.value(otherFilters.length).pipe(
    Match.when(0, () => recognized),
    Match.when(1, () => {
      return Array.append(recognized, Label.Literal({ val: "1 Filter" }));
    }),
    Match.orElse((count) => {
      return Array.append(recognized, Label.Literal({ val: `${count} Filters` }));
    }),
  );

  const filterLabels = Array.match(filters, {
    onEmpty: () => [Label.Literal({ val: "All records" })],
    onNonEmpty: identity,
  });

  const displayLabels = Array.map(StreamSettings.changedDisplay(settings), (field) => {
    return Label.Literal({ val: settings[field] });
  });

  return Array.appendAll(filterLabels, displayLabels);
}

export function renderLabels(
  labels: readonly Label[],
  recordLabel: (id: RecordSchema.Id) => string = (id) => id,
): string {
  return Array.map(labels, (label) => Filters.renderLabel(label, recordLabel)).join(" · ");
}

export function expressionLabel(
  expression: AttrsSchema.FilterExpr,
  registry: Filters.Registry = Filters.builtin,
): Result.Result<Label, AttrsSchema.FilterExpr> {
  return Result.fromOption(registry.getLabel(expression), () => expression);
}

export * as StreamRefSpec from "./spec";
