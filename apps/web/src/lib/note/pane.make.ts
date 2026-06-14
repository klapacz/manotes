import { PaneSchema } from "./pane.schema";

export function notes(): PaneSchema.Pane {
  return {
    _tag: "stream",
    filter: { type: "notes" },
    sort: "date",
  };
}

export function note(id: string): PaneSchema.Pane {
  return { _tag: "note", id };
}

export function backlink(targetId: string): PaneSchema.Pane {
  return {
    _tag: "stream",
    filter: { type: "notes", backlinksTo: targetId },
    sort: "date",
  };
}

export function date(date: string): PaneSchema.Pane {
  return {
    _tag: "stream",
    filter: { type: "notes", date },
    sort: "date",
  };
}

export * as PaneMake from "./pane.make";
