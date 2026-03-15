import { Schema } from "effect";
import * as SchemaPrimitives from "./schema/primitives";

export const Type = Schema.Literal("update");

const EventId = Schema.NonEmptyString;
const CommitSeq = Schema.Union(Schema.Null, Schema.Number);

export const Record = Schema.Struct({
  localSeq: Schema.Number,
  noteId: Schema.NonEmptyString,
  isDaily: SchemaPrimitives.BooleanFromInt,
  type: Type,
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  createdAt: Schema.DateTimeUtc,
  id: EventId,
  commitSeq: CommitSeq,
});

export const Create = Schema.Struct({
  noteId: Schema.NonEmptyString,
  isDaily: SchemaPrimitives.BooleanFromInt,
  type: Type,
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  createdAt: Schema.DateTimeUtc,
  id: Schema.optional(Schema.NonEmptyString),
  commitSeq: Schema.optional(Schema.Number),
});
