import { PaneSchema } from "./pane.schema";

export function notes(): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "notes" },
    sort: "date",
  };
}

export function note(id: string): PaneSchema.PaneInput {
  return { _tag: "note", id };
}

export function backlink(targetId: string): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "notes", backlinksTo: targetId },
    sort: "date",
  };
}

export function related(targetId: string): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "all", relatedTo: targetId },
    sort: "updated",
  };
}

export function date(date: string): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "notes", date },
    sort: "date",
  };
}

export * as PaneMake from "./pane.make";
