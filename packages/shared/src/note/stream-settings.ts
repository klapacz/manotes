import type { PaneSchema } from "./pane.schema";

export type Settings = PaneSchema.StreamSettings;

export type Filter = Settings["filter"];

export type FilterField = keyof Filter;

export type Display = Pick<Settings, "sort" | "view">;

export function defaults(type: Filter["type"]): Settings {
  return { filter: { type }, sort: type === "notes" ? "date" : "updated", view: "full" };
}

export function changedFilters(filter: Filter): FilterField[] {
  const fields = ["type", "search", "date", "backlinksTo", "linksFrom"] as const;
  const initial = defaults("notes").filter;

  return fields.filter((field) =>
    field === "type" ? filter.type !== initial.type : Boolean(filter[field]),
  );
}

export function changedDisplay(settings: Settings): (keyof Display)[] {
  const display = defaults(settings.filter.type);

  return (["sort", "view"] as const).filter((field) => settings[field] !== display[field]);
}

export function clearFilter(filter: Filter, field: FilterField): Filter {
  return { ...filter, [field]: defaults("notes").filter[field] };
}

export function changeFilter(current: Settings, filter: Filter) {
  const typeChanged = current.filter.type !== filter.type;

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
