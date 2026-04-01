import { Schema } from "effect";

export const Type = Schema.Literals(["update"]);

const EventId = Schema.NonEmptyString;
const CommitSeq = Schema.Union([Schema.Null, Schema.Number]);

export const Record = Schema.Struct({
  localSeq: Schema.Number,
  noteId: Schema.NonEmptyString,
  type: Type,
  payload: Schema.Uint8Array,
  createdAt: Schema.DateTimeUtcFromString,
  id: EventId,
  commitSeq: CommitSeq,
});
export type Record = typeof Record.Type;

export const Create = Schema.Struct({
  noteId: Schema.NonEmptyString,
  type: Type,
  payload: Schema.Uint8Array,
  createdAt: Schema.DateTimeUtcFromString,
  id: Schema.optional(Schema.NonEmptyString),
  commitSeq: Schema.optional(Schema.Number),
});
export type Create = typeof Create.Type;
