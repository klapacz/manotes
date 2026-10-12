import { PaneSchema } from "./pane.schema";
import { Match, Predicate, Record, Schema } from "effect";
import { AttrsSchema } from "../attrs.schema";
import { StreamSettings } from "./stream-settings";

const Comparison = Schema.TaggedStruct("cmp", { val: AttrsSchema.TargetFilterCmp });

export function toAttrs(filter: StreamSettings.Filter): AttrsSchema.TargetFilter {
  const expressions = [
    Comparison.make({
      val: ["_tag", "=", Predicate.isTagged(filter.type, "prop") ? "prop" : "note"],
    }),
  ];

  if (!Predicate.isTagged(filter.type, "prop")) {
    expressions.push(
      Comparison.make({ val: ["title", "exists", Predicate.isTagged(filter.type, "pages")] }),
    );
  }

  if (filter.search !== undefined) {
    expressions.push(Comparison.make({ val: ["body", "contains", filter.search] }));
  }

  if (filter.date !== undefined) {
    expressions.push(Comparison.make({ val: ["date", "=", filter.date] }));
  }

  if (filter.backlinksTo !== undefined) {
    expressions.push(
      Comparison.make({
        val: [["link", "->", AttrsSchema.NoteId.make(filter.backlinksTo)], "exists", true],
      }),
    );
  }

  if (filter.linksFrom !== undefined) {
    expressions.push(
      Comparison.make({
        val: [["link", "<-", AttrsSchema.NoteId.make(filter.linksFrom)], "exists", true],
      }),
    );
  }

  for (const [id, value] of Record.toEntries(StreamSettings.propFilters(filter))) {
    expressions.push(Comparison.make({ val: [["prop", id], "=", value] }));
  }

  return expressions;
}

/** Drops OR groups and unsupported comparisons. Repeated fields use the last comparison. */
export function fromAttrs(expressions: AttrsSchema.Filter): StreamSettings.Filter {
  return expressions.reduce(applyComparison, {
    type: PaneSchema.StreamFilterType.cases.notes.make({}),
    props: {},
  });
}

function applyComparison(
  filter: StreamSettings.Filter,
  expression: AttrsSchema.FilterExpr,
): StreamSettings.Filter {
  return Match.value(expression).pipe(
    Match.tag("and", "or", (group) =>
      Predicate.isTagged(group, "and") ? group.val.reduce(applyComparison, filter) : filter,
    ),
    Match.tag("cmp", ({ val }) =>
      Match.value(val).pipe(
        Match.when(["_tag", "=", "prop"], (): StreamSettings.Filter => ({
          ...filter,
          type: PaneSchema.StreamFilterType.cases.prop.make({}),
        })),
        Match.when(["_tag", "=", "note"], (): StreamSettings.Filter => ({
          ...filter,
          type: PaneSchema.StreamFilterType.cases.notes.make({}),
        })),
        Match.when(["title", "exists", Match.boolean], ([, , value]): StreamSettings.Filter => ({
          ...filter,
          type: value
            ? PaneSchema.StreamFilterType.cases.pages.make({})
            : PaneSchema.StreamFilterType.cases.notes.make({}),
        })),
        Match.when(["body", "contains", Match.string], ([, , search]) => ({ ...filter, search })),
        Match.when(["date", "=", Match.string], ([, , date]) => ({ ...filter, date })),
        Match.when([["link", "->", Match.string], "exists", true], ([[, , backlinksTo]]) => ({
          ...filter,
          backlinksTo,
        })),
        Match.when([["link", "<-", Match.string], "exists", true], ([[, , linksFrom]]) => ({
          ...filter,
          linksFrom,
        })),
        Match.when(
          [["prop", Match.string], "=", Schema.is(AttrsSchema.PropVal)],
          ([[, propId], , value]) =>
            StreamSettings.changePropFilter(filter, {
              propId: AttrsSchema.NoteId.make(propId),
              value,
            }),
        ),
        Match.orElse(() => filter),
      ),
    ),
    Match.exhaustive,
  );
}

export * as StreamFilter from "./stream-filter";
