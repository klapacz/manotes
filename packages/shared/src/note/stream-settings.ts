import { PaneSchema } from "./pane.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { Equal, Option, Predicate, Record } from "effect";
import type { NoteSchema } from "../note.schema";
import { AttrsSchema } from "../attrs.schema";

export type Settings = PaneSchema.StreamSettings;

export type Filter = Settings["filter"];

export const typeLabels = {
  notes: "Notes",
  pages: "Pages",
  prop: "Properties",
  enum_option: "Enum options",
} satisfies Record<Filter["type"]["_tag"], string>;

type PropFilters = NonNullable<Filter["props"]>;

export type FilterField = Exclude<keyof Filter, "props">;

export type Display = Pick<Settings, "sort" | "view">;

export function defaults(type: Filter["type"]): Settings {
  return {
    filter: { type, props: defaultProps() },
    sort: Predicate.isTagged(type, "notes") ? "date" : "updated",
    view: "full",
  };
}

function defaultProps(): PropFilters {
  return { [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: false }) };
}

/** Resolves omitted property filters to defaults; an explicit empty map stays cleared. */
export function propFilters(filter: Pick<Filter, "props">): PropFilters {
  return filter.props ?? defaultProps();
}

/** Reads a property's comparison value, including the hidden default archive filter. */
export function propFilter(
  filter: Pick<Filter, "props">,
  propId: NoteSchema.Id,
): AttrsSchema.PropVal | undefined {
  return Option.getOrUndefined(Record.get(propFilters(filter), propId));
}

/** Lists added, changed or cleared comparisons for indicators and filter chips.
 * Structural equality keeps URL-decoded defaults unchanged.
 */
export function changedProps(filter: Filter): NoteSchema.Id[] {
  const initial = defaultProps();
  const current = propFilters(filter);

  return [...new Set([...Record.keys(initial), ...Record.keys(current)])].filter(
    (id) => !Equal.equals(Record.get(current, id), Record.get(initial, id)),
  );
}

/** Sets or clears one comparison, preserving all other effective property filters. */
export function changePropFilter(
  filter: Filter,
  opts: { readonly propId: NoteSchema.Id; readonly value: AttrsSchema.PropVal | undefined },
): Filter {
  const props = propFilters(filter);

  return {
    ...filter,
    props:
      opts.value === undefined
        ? Record.remove(props, opts.propId)
        : Record.set(props, opts.propId, opts.value),
  };
}

export function changedFilters(filter: Filter): FilterField[] {
  const fields = ["type", "search", "date", "backlinksTo", "linksFrom"] as const;
  const initial = defaults(PaneSchema.StreamFilterType.cases.notes.make({})).filter;

  return fields.filter((field) =>
    field === "type" ? !Equal.equals(filter.type, initial.type) : Boolean(filter[field]),
  );
}

export function changedDisplay(settings: Settings): (keyof Display)[] {
  const display = defaults(settings.filter.type);

  return (["sort", "view"] as const).filter((field) => settings[field] !== display[field]);
}

export function clearFilter(filter: Filter, field: FilterField): Filter {
  return {
    ...filter,
    [field]: defaults(PaneSchema.StreamFilterType.cases.notes.make({})).filter[field],
  };
}

export function changeFilter(current: Settings, filter: Filter) {
  const typeChanged = !Equal.equals(current.filter.type, filter.type);

  return {
    settings: {
      ...current,
      filter,
      sort: typeChanged ? defaults(filter.type).sort : current.sort,
    },
    typeChanged,
  };
}

export * as StreamSettings from "./stream-settings";
