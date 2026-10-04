import { Effect, Schema } from "effect";
import { nanoid } from "nanoid";
import type * as NoteRepo from "../note.repo";
import { NoteSchema } from "../note.schema";
import * as TemporalSchema from "../temporal.schema";

const StreamFilterType = Schema.Literals(["notes", "pages"]);

const StreamFilter = Schema.Struct({
  type: StreamFilterType.pipe(Schema.withDecodingDefault(Effect.sync(() => "notes" as const))),
  backlinksTo: Schema.optional(Schema.String),
  linksFrom: Schema.optional(Schema.String),
  date: Schema.optional(TemporalSchema.PlainDateString),
  search: Schema.optional(Schema.String),
});

const StreamSort = Schema.Literals(["date", "updated"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "date" as const)),
);

export type StreamSort = typeof StreamSort.Type;

// Display only: snippets clamp each note to its first lines in the stream.
const StreamView = Schema.Literals(["full", "snippets"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "full" as const)),
  Schema.withConstructorDefault(Effect.succeed("full" as const)),
);

export type StreamView = typeof StreamView.Type;

export const Id = Schema.NonEmptyString.pipe(Schema.brand("PaneId"));

export type Id = typeof Id.Type;

const PaneId = Id.pipe(Schema.withDecodingDefaultKey(Effect.sync(makeId)));

export const Pane = Schema.TaggedUnion({
  note: {
    paneId: PaneId,
    id: NoteSchema.Id,
  },
  stream: {
    paneId: PaneId,
    filter: StreamFilter,
    sort: StreamSort,
    view: StreamView,
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
    linksFrom: pane.filter.linksFrom,
    search: pane.filter.search?.trim() || undefined,
    sort: pane.sort,
  };
}

function makeId(): Id {
  return Id.make(nanoid());
}

export * as PaneSchema from "./pane.schema";
