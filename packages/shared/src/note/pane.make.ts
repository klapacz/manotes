import { Data } from "effect";
import { StreamSettings } from "./stream-settings";
import { PaneSchema } from "./pane.schema";
import type { NoteSchema } from "../note.schema";

const make = Data.taggedEnum<PaneSchema.PaneInput>();

export function recordings() {
  return make.recordings({});
}

export function notes() {
  return make.stream(StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({})));
}

export function note(id: string) {
  return make.note({ id });
}

export function enumOptions(opts: { readonly enum_parent: NoteSchema.Id }) {
  return make.stream(
    StreamSettings.defaults(PaneSchema.StreamFilterType.cases.enum_option.make(opts)),
  );
}

// Incoming backlinks: notes that link to `targetId`.
export function backlink(targetId: string) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, backlinksTo: targetId } });
}

// Outgoing links: notes that `sourceId` links to.
export function outgoing(sourceId: string) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.pages.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, linksFrom: sourceId } });
}

export function date(date: string) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, date } });
}

export * as PaneMake from "./pane.make";
