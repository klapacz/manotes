import { Schema } from "effect";
import { Msgpack } from "effect/unstable/encoding";
import * as TemporalSchema from "./temporal.schema";

export const Type = Schema.Literals(["update", "date"]);

const EventId = Schema.NonEmptyString;

const CommitSeq = Schema.Union([Schema.Null, Schema.Number]);

export const DatePayload = Schema.Struct({
  date: TemporalSchema.PlainDateString,
});

const DatePayloadBytes = Msgpack.schema(DatePayload);

export const encodeDatePayload = Schema.encodeEffect(DatePayloadBytes);

export const decodeDatePayload = Schema.decodeEffect(DatePayloadBytes);

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
