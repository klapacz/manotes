import { Array, Match, Option, Record, Result, Schema, Struct } from "effect";
import type { PaneSchema } from "./pane.schema";
import { Filters } from "./filters";
import { AttrsSchema } from "../attrs.schema";

export type Settings = PaneSchema.StreamSettings;

export type Filter = AttrsSchema.Filter;

export type Display = Pick<Settings, "sort" | "view">;

// TODO: Use these presets and enumOptionsPreset to generate PresetCommands in
// apps/web/src/components/record/filter-picker.tsx.
export const presets = {
  notes: {
    filter: [Filters.namedTypes.notes.make(), Filters.aliases.unarchived.make()],
    sort: "date",
    view: "full",
  },
  pages: {
    filter: [Filters.namedTypes.pages.make(), Filters.aliases.unarchived.make()],
    sort: "updated",
    view: "full",
  },
} as const satisfies Record<string, Settings>;

export const defaultPreset = presets.notes;

export const defaultDisplay = Struct.pick(defaultPreset, ["sort", "view"]);

export function enumOptionsPreset(parentId: AttrsSchema.RecordId): Settings {
  return {
    filter: [Filters.enumOptions.make(parentId), Filters.aliases.unarchived.make()],
    sort: "updated",
    view: "full",
  };
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
