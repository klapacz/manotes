import { Effect, Schema } from "effect";
import type * as NoteRepo from "../note.repo";
import * as TemporalSchema from "../temporal.schema";

const StreamFilterType = Schema.Literals(["notes", "pages"]);

const StreamFilter = Schema.Struct({
  type: StreamFilterType.pipe(Schema.withDecodingDefault(Effect.sync(() => "notes" as const))),
  backlinksTo: Schema.optional(Schema.String),
  date: Schema.optional(TemporalSchema.PlainDateString),
});

const StreamSort = Schema.Literals(["date", "updated"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "date" as const)),
);
export type StreamSort = typeof StreamSort.Type;

export const Pane = Schema.TaggedUnion({
  note: {
    id: Schema.String,
  },
  stream: {
    filter: StreamFilter,
    sort: StreamSort,
  },
});
export type Pane = typeof Pane.Type;
export type PaneStream = typeof Pane.cases.stream.Type;
export type PaneNote = typeof Pane.cases.note.Type;

export function paneToQuery(pane: PaneStream): NoteRepo.StreamListQuery {
  return {
    type: pane.filter.type,
    date: pane.filter.date,
    backlinksTo: pane.filter.backlinksTo,
    sort: pane.sort,
  };
}

export * as PaneSchema from "./pane.schema";
