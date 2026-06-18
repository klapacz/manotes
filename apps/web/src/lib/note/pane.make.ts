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

// Incoming backlinks: notes that link to `targetId`.
export function backlink(targetId: string): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "notes", backlinksTo: targetId },
    sort: "date",
  };
}

// Outgoing links: notes that `sourceId` links to.
export function outgoing(sourceId: string): PaneSchema.PaneInput {
  return {
    _tag: "stream",
    filter: { type: "pages", linksFrom: sourceId },
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
