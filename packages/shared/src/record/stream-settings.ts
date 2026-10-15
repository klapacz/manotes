import { Array, Match, Option, Record, Result, Schema, Struct } from "effect";
import type { PaneSchema } from "./pane.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { AttrsSchema } from "../attrs.schema";

export type Settings = PaneSchema.StreamSettings;

export type Filter = AttrsSchema.Filter;

export type Display = Pick<Settings, "sort" | "view">;

export const conditions = {
  notes: AttrsSchema.makeTargetFilterExpr.and({
    val: [
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "note"] }),
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["title", "exists", false] }),
    ],
  }),
  pages: AttrsSchema.makeTargetFilterExpr.and({
    val: [
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "note"] }),
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["title", "exists", true] }),
    ],
  }),
  unarchived: AttrsSchema.makeTargetFilterExpr.cmp({
    val: [["prop", BuiltinAttrs.archivedId], "=", BuiltinAttrs.archived.prop_default],
  }),
} as const satisfies Record<string, AttrsSchema.TargetFilterExpr>;

export const presets = {
  notes: { filter: [conditions.notes, conditions.unarchived], sort: "date", view: "full" },
  pages: { filter: [conditions.pages, conditions.unarchived], sort: "updated", view: "full" },
} as const satisfies Record<string, Settings>;

export const defaultPreset = presets.notes;

export const defaultDisplay = Struct.pick(defaultPreset, ["sort", "view"]);

export function enumOptions(parentId: AttrsSchema.RecordId): AttrsSchema.TargetFilterExpr {
  return AttrsSchema.makeTargetFilterExpr.and({
    val: [
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "owned"] }),
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["owned_type", "=", "enum_option"] }),
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["owned_parent", "=", parentId] }),
    ],
  });
}

export function enumOptionsPreset(parentId: AttrsSchema.RecordId): Settings {
  return {
    filter: [enumOptions(parentId), conditions.unarchived],
    sort: "updated",
    view: "full",
  };
}

export function enumOptionsParent(
  expression: AttrsSchema.FilterExpr,
): Result.Result<AttrsSchema.RecordId, AttrsSchema.FilterExpr> {
  return Match.value(expression).pipe(
    Match.tag("and", ({ val }) => {
      // Named enum groups contain exactly these three comparisons, in order.
      if (val.length !== 3) return Result.fail(expression);

      const comparisons = Array.map(val, (child) => {
        return Match.value(child).pipe(
          Match.tag("cmp", ({ val }) => val),
          Match.orElse(() => undefined),
        );
      });

      return Match.value([comparisons[0], comparisons[1], comparisons[2]] as const).pipe(
        Match.when(
          [
            ["_tag", "=", "owned"],
            ["owned_type", "=", "enum_option"],
            ["owned_parent", "=", Schema.is(AttrsSchema.RecordId)],
          ],
          (matches) => matches[2][2],
        ),
        Match.result,
        Result.mapError(() => expression),
      );
    }),
    Match.orElse(() => Result.fail(expression)),
  );
}

/** Comparisons required by every match, for creation defaults. Never chooses an OR branch. */
export function requiredComparisons(filter: Filter): readonly AttrsSchema.FilterCmp[] {
  return Array.flatMap(filter, (expression) => {
    return Match.value(expression).pipe(
      Match.tag("cmp", ({ val }) => [val]),
      Match.tag("and", ({ val }) => requiredComparisons(val)),
      Match.tag("or", () => []),
      Match.exhaustive,
    );
  });
}

export function firstSearch(filter: Filter): Option.Option<string> {
  return Array.findFirst(requiredComparisons(filter), (comparison) => {
    return Match.value(comparison).pipe(
      Match.when(["body", "contains", Match.string], ([, , text]) => Option.some(text)),
      Match.orElse(() => Option.none()),
    );
  });
}

export function firstDate(filter: Filter): Option.Option<string> {
  return Array.findFirst(requiredComparisons(filter), (comparison) => {
    return Match.value(comparison).pipe(
      Match.when(["date", "=", Match.string], ([, , date]) => Option.some(date)),
      Match.orElse(() => Option.none()),
    );
  });
}

export function firstTag(filter: Filter): Option.Option<AttrsSchema.RecordTag> {
  return Array.findFirst(requiredComparisons(filter), (comparison) => {
    return Match.value(comparison).pipe(
      Match.when(["_tag", "=", Schema.is(AttrsSchema.RecordTag)], ([, , tag]) => Option.some(tag)),
      Match.orElse(() => Option.none()),
    );
  });
}

export function linksTo(filter: Filter): readonly AttrsSchema.RecordId[] {
  return Array.filterMap(requiredComparisons(filter), (comparison) => {
    return Match.value(comparison).pipe(
      Match.when([Schema.is(AttrsSchema.LinkTarget), "exists", true], ([link]) => {
        return Match.value(link).pipe(
          Match.when(["link", "->", Match.string], ([, , id]) => id),
          Match.result,
        );
      }),
      Match.orElse(() => Result.fail(comparison)),
    );
  });
}

export function firstLinkTo(filter: Filter): Option.Option<AttrsSchema.RecordId> {
  return Array.head(linksTo(filter));
}

export function changedDisplay(settings: Settings): (keyof Display)[] {
  return Array.filter(
    Record.keys(defaultDisplay),
    (field) => settings[field] !== defaultDisplay[field],
  );
}

export * as StreamSettings from "./stream-settings";
