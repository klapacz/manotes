import { Schema, SchemaGetter } from "effect";
import type { UnknownNodeJSON } from "./node-json";
import * as TemporalSchema from "./temporal.schema";

const ContentValue = Schema.declare<UnknownNodeJSON>((_x): _x is UnknownNodeJSON => true);

export const Content = Schema.String.pipe(
  Schema.decodeTo(ContentValue, {
    decode: SchemaGetter.transform((value: string) => JSON.parse(value) as UnknownNodeJSON),
    encode: SchemaGetter.transform((value: UnknownNodeJSON) => JSON.stringify(value)),
  }),
);

export const MaterializedYUpdate = Schema.Union([Schema.Null, Schema.Uint8Array]);

export const Record = Schema.Struct({
  id: Schema.String,
  title: Schema.Union([Schema.String, Schema.Null]),
  content: Content,
  text: Schema.String,
  date: TemporalSchema.PlainDateString,
  materializedYUpdate: MaterializedYUpdate,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  lastEventLocalSeq: Schema.Number,
});
export type Record = typeof Record.Type;

export const Preview = Schema.Struct({
  id: Schema.String,
  title: Schema.Union([Schema.String, Schema.Null]),
  text: Schema.String,
  date: TemporalSchema.PlainDateString,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
});

/** One-shot editor boot payload — read atomically once; events drive the doc afterwards. */
export const BootRecord = Schema.Struct({
  materializedYUpdate: MaterializedYUpdate,
  lastEventLocalSeq: Schema.Number,
});

export type BootRecord = typeof BootRecord.Type;

/** Ordering/grouping metadata for stream lists; content stays out of list queries. */
export const Meta = Schema.Struct({
  id: Schema.String,
  date: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type Meta = typeof Meta.Type;

export const Create = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.Union([Schema.String, Schema.Null]),
  content: Content,
  text: Schema.String,
  date: TemporalSchema.PlainDateString,
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  lastEventLocalSeq: Schema.optional(Schema.Number),
});

export const Update = Schema.Struct({
  title: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
  content: Schema.optional(Content),
  text: Schema.optional(Schema.String),
  date: Schema.optional(TemporalSchema.PlainDateString),
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.optional(Schema.DateTimeUtcFromString),
  updatedAt: Schema.optional(Schema.DateTimeUtcFromString),
  lastEventLocalSeq: Schema.optional(Schema.Number),
});

export * as NoteSchema from "./note.schema";
