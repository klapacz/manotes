import { PaneSchema } from "./pane.schema";
import { Array, Match, Predicate, Record, Schema } from "effect";
import { AttrsSchema } from "../attrs.schema";
import { StreamSettings } from "./stream-settings";

const Comparison = Schema.TaggedStruct("cmp", { val: AttrsSchema.TargetFilterCmp });

export function toAttrs(filter: StreamSettings.Filter): AttrsSchema.TargetFilter {
  // Pane types group record constraints; attrs filters compare the stored fields separately.
  const expressions = Match.value(filter.type).pipe(
    Match.tag("notes", () => [
      Comparison.make({ val: ["_tag", "=", "note"] }),
      Comparison.make({ val: ["title", "exists", false] }),
    ]),
    Match.tag("pages", () => [
      Comparison.make({ val: ["_tag", "=", "note"] }),
      Comparison.make({ val: ["title", "exists", true] }),
    ]),
    Match.tag("prop", () => [Comparison.make({ val: ["_tag", "=", "prop"] })]),
    Match.tag("enum_option", ({ enum_parent }) => [
      Comparison.make({ val: ["_tag", "=", "owned"] }),
      Comparison.make({ val: ["owned_type", "=", "enum_option"] }),
      Comparison.make({ val: ["owned_parent", "=", enum_parent] }),
    ]),
    Match.exhaustive,
  );

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
export function fromAttrs(expressions: AttrsSchema.Filter | undefined): StreamSettings.Filter {
  // An unset scope uses the same unarchived Notes filter as a new stream pane.
  if (expressions === undefined) {
    return StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({})).filter;
  }

  // Both passes need the same comparisons, including those nested inside AND groups.
  const comparisons = flattenComparisons(expressions);

  const filter = comparisons.reduce(applyComparison, {
    type: PaneSchema.StreamFilterType.cases.notes.make({}),
    props: {},
  });

  // Ownership spans three comparisons. Collect them independently of order, keeping the last values.
  const ownership = comparisons.reduce<{
    tag?: AttrsSchema.RecordTag;
    owned_type?: "enum_option";
    owned_parent?: AttrsSchema.NoteId;
  }>(
    (fields, val) =>
      Match.value(val).pipe(
        Match.when(["_tag", "=", Schema.is(AttrsSchema.RecordTag)], ([, , tag]) => ({
          ...fields,
          tag,
        })),
        Match.when(["owned_type", "=", "enum_option"], () => ({
          ...fields,
          owned_type: "enum_option" as const,
        })),
        Match.when(["owned_parent", "=", Match.string], ([, , owned_parent]) => ({
          ...fields,
          owned_parent: AttrsSchema.NoteId.make(owned_parent),
        })),
        Match.orElse(() => fields),
      ),
    {},
  );

  // An enum-option pane type cannot be constructed without its required parent.
  if (
    ownership.tag === "owned" &&
    ownership.owned_type === "enum_option" &&
    ownership.owned_parent !== undefined
  ) {
    return {
      ...filter,
      type: PaneSchema.StreamFilterType.cases.enum_option.make({
        enum_parent: ownership.owned_parent,
      }),
    };
  }

  return filter;
}

// Pane filters cannot represent OR groups; dropping them preserves the converter's existing behavior.
function flattenComparisons(expressions: AttrsSchema.Filter): readonly AttrsSchema.FilterCmp[] {
  return Array.flatMap(expressions, (expression) =>
    Match.value(expression).pipe(
      Match.tag("cmp", ({ val }) => [val]),
      Match.tag("and", "or", (group) =>
        Predicate.isTagged(group, "and") ? flattenComparisons(group.val) : [],
      ),
      Match.exhaustive,
    ),
  );
}

function applyComparison(
  filter: StreamSettings.Filter,
  val: AttrsSchema.FilterCmp,
): StreamSettings.Filter {
  return Match.value(val).pipe(
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
  );
}

export * as StreamFilter from "./stream-filter";
