import { Effect, Schema } from "effect";
import { nanoid } from "nanoid";
import type * as NoteRepo from "../note.repo";
import * as TemporalSchema from "../temporal.schema";

const StreamFilterType = Schema.Literals(["all", "notes", "pages"]);

const StreamFilter = Schema.Struct({
  type: StreamFilterType.pipe(Schema.withDecodingDefault(Effect.sync(() => "notes" as const))),
  backlinksTo: Schema.optional(Schema.String),
  relatedTo: Schema.optional(Schema.String),
  date: Schema.optional(TemporalSchema.PlainDateString),
});

const StreamSort = Schema.Literals(["date", "updated"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "date" as const)),
);
export type StreamSort = typeof StreamSort.Type;

const PaneId = Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.sync(makeId)));

export const Pane = Schema.TaggedUnion({
  note: {
    paneId: PaneId,
    id: Schema.String,
  },
  stream: {
    paneId: PaneId,
    filter: StreamFilter,
    sort: StreamSort,
  },
});
export type Pane = typeof Pane.Type;
export type PaneInput = typeof Pane.Encoded;
export type PaneStream = typeof Pane.cases.stream.Type;
export type PaneNote = typeof Pane.cases.note.Type;

export function paneToQuery(pane: PaneStream): NoteRepo.StreamListQuery {
  return {
    type: pane.filter.type,
    date: pane.filter.date,
    backlinksTo: pane.filter.backlinksTo,
    relatedTo: pane.filter.relatedTo,
    sort: pane.sort,
  };
}

function makeId(): string {
  return nanoid();
}

export * as PaneSchema from "./pane.schema";
