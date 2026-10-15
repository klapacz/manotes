import { Data, Effect, Schema } from "effect";
import { nanoid } from "nanoid";
import { RecordSchema } from "../record.schema";
import { StreamSettings as Settings } from "./stream-settings";
import { AttrsSchema } from "../attrs.schema";

const StreamSort = Schema.Literals(["date", "updated"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "date" as const)),
);

export type StreamSort = typeof StreamSort.Type;

// Display only: snippets clamp each record to its first lines in the stream.
const StreamView = Schema.Literals(["full", "snippets"]).pipe(
  Schema.withDecodingDefault(Effect.sync(() => "full" as const)),
  Schema.withConstructorDefault(Effect.succeed("full" as const)),
);

export type StreamView = typeof StreamView.Type;

export const StreamSettings = Schema.Struct({
  filter: AttrsSchema.Filter.pipe(
    Schema.withDecodingDefault(
      Effect.sync((): AttrsSchema.Filter => Settings.defaultPreset.filter),
    ),
  ),
  sort: StreamSort,
  view: StreamView,
});

export type StreamSettings = typeof StreamSettings.Type;

export const Id = Schema.NonEmptyString.pipe(Schema.brand("PaneId"));

export type Id = typeof Id.Type;

const PaneId = Id.pipe(Schema.withDecodingDefaultKey(Effect.sync(makeId)));

export const Source = Schema.TaggedUnion({
  prop: { id: RecordSchema.Id },
  rule: { id: RecordSchema.Id },
});

export const Pane = Schema.TaggedUnion({
  recordings: { paneId: PaneId },
  record: {
    paneId: PaneId,
    id: RecordSchema.Id,
  },
  stream: {
    paneId: PaneId,
    ...StreamSettings.fields,
    source: Schema.optional(Source),
  },
});

export type Pane = typeof Pane.Type;

export type PaneInput = typeof Pane.Encoded;

export type PaneStream = typeof Pane.cases.stream.Type;

export type PaneRecord = typeof Pane.cases.record.Type;

export type PaneRecordings = typeof Pane.cases.recordings.Type;

export const make = Data.taggedEnum<PaneInput>();

function makeId(): Id {
  return Id.make(nanoid());
}

export * as PaneSchema from "./pane.schema";
