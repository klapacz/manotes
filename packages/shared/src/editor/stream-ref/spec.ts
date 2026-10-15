import { AttrsSchema } from "../../attrs.schema";
import { RecordSchema } from "../../record.schema";
import { Array, Data, Equal, identity, Match, Option, pipe, Result, Schema } from "effect";
import {
  defineCommands as defineProsekitCommands,
  defineNodeSpec,
  insertNode,
} from "prosekit/core";
import { PaneSchema } from "../../record/pane.schema";
import { StreamSettings } from "../../record/stream-settings";

export const Attrs = PaneSchema.StreamSettings;

export type Attrs = typeof Attrs.Type;

export type Label = Data.TaggedEnum<{
  Literal: { val: string };
  Record: { id: RecordSchema.Id; val: (label: string) => string };
}>;

export const Label = Data.taggedEnum<Label>();

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

export function labels(settings: Attrs): readonly Label[] {
  const [recognized, otherFilters] = Array.partition(settings.filter, expressionLabel);

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
  return pipe(
    labels,
    Array.map((label) => {
      return Match.value(label).pipe(
        Match.tag("Literal", ({ val }) => val),
        Match.tag("Record", ({ id, val }) => val(recordLabel(id))),
        Match.exhaustive,
      );
    }),
    Array.join(" · "),
  );
}

export function expressionLabel(
  expression: AttrsSchema.FilterExpr,
): Result.Result<Label, AttrsSchema.FilterExpr> {
  return StreamSettings.enumOptionsParent(expression).pipe(
    Result.map((id) => {
      return Label.Record({ id, val: (label) => `Enum options · ${label}` });
    }),
    Result.orElse((expression) => {
      return Match.value(expression).pipe(
        Match.when(
          (value: AttrsSchema.FilterExpr): boolean => {
            return Equal.equals(value, StreamSettings.conditions.notes);
          },
          () => Label.Literal({ val: "Notes" }),
        ),
        Match.when(
          (value: AttrsSchema.FilterExpr): boolean => {
            return Equal.equals(value, StreamSettings.conditions.pages);
          },
          () => Label.Literal({ val: "Pages" }),
        ),
        Match.when(
          (value: AttrsSchema.FilterExpr): boolean => {
            return Equal.equals(value, StreamSettings.conditions.unarchived);
          },
          () => Label.Literal({ val: "Unarchived" }),
        ),
        Match.when({ _tag: "cmp", val: ["body", "contains", Match.string] }, ({ val }) => {
          return Label.Literal({ val: `“${val[2]}”` });
        }),
        Match.when({ _tag: "cmp", val: ["date", "=", Match.string] }, ({ val }) => {
          return Label.Literal({ val: val[2] });
        }),
        Match.when(
          { _tag: "cmp", val: [Schema.is(AttrsSchema.LinkTarget), "exists", true] },
          ({ val: [link] }) => {
            const direction = Match.value(link[1]).pipe(
              Match.when("->", () => "Links to"),
              Match.when("<-", () => "Links from"),
              Match.exhaustive,
            );

            return Label.Record({ id: link[2], val: (label) => `${direction} ${label}` });
          },
        ),
        Match.result,
      );
    }),
  );
}

export * as StreamRefSpec from "./spec";
