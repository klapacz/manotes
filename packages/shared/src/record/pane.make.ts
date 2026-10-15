import { Data } from "effect";
import { StreamSettings } from "./stream-settings";
import { PaneSchema } from "./pane.schema";
import type { RecordSchema } from "../record.schema";

const make = Data.taggedEnum<PaneSchema.PaneInput>();

export function recordings() {
  return make.recordings({});
}

export function notes() {
  return make.stream(StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({})));
}

export function record(id: RecordSchema.Id) {
  return make.record({ id });
}

export function enumOptions(opts: { readonly enum_parent: RecordSchema.Id }) {
  return make.stream(
    StreamSettings.defaults(PaneSchema.StreamFilterType.cases.enum_option.make(opts)),
  );
}

export function propScope(opts: {
  readonly propId: RecordSchema.Id;
  readonly filter: StreamSettings.Filter;
}) {
  return make.stream({
    ...StreamSettings.defaults(opts.filter.type),
    filter: opts.filter,
    scope: { propId: opts.propId },
  });
}

export function ruleTargets(opts: {
  readonly ruleId: RecordSchema.Id;
  readonly filter: StreamSettings.Filter;
}) {
  return make.stream({
    ...StreamSettings.defaults(opts.filter.type),
    filter: opts.filter,
    matches: { ruleId: opts.ruleId },
  });
}

// Incoming backlinks: records that link to `targetId`.
export function backlink(targetId: RecordSchema.Id) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, backlinksTo: targetId } });
}

// Outgoing links: records that `sourceId` links to.
export function outgoing(sourceId: RecordSchema.Id) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.pages.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, linksFrom: sourceId } });
}

export function date(date: string) {
  const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({}));

  return make.stream({ ...settings, filter: { ...settings.filter, date } });
}

export * as PaneMake from "./pane.make";
