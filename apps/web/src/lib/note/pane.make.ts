import { Data } from "effect";
import { PaneSchema } from "./pane.schema";

const make = Data.taggedEnum<PaneSchema.PaneInput>();

export function notes() {
  return make.stream({
    filter: { type: "notes" },
    sort: "date",
  });
}

export function note(id: string) {
  return make.note({ id });
}

// Incoming backlinks: notes that link to `targetId`.
export function backlink(targetId: string) {
  return make.stream({
    filter: { type: "notes", backlinksTo: targetId },
    sort: "date",
  });
}

// Outgoing links: notes that `sourceId` links to.
export function outgoing(sourceId: string) {
  return make.stream({
    filter: { type: "pages", linksFrom: sourceId },
    sort: "updated",
  });
}

export function date(date: string) {
  return make.stream({
    filter: { type: "notes", date },
    sort: "date",
  });
}

export * as PaneMake from "./pane.make";
