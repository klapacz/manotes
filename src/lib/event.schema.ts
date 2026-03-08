import { Schema } from "effect";

export const Type = Schema.Literal("create", "update");

export const Record = Schema.Struct({
  localSeq: Schema.Number,
  noteId: Schema.NonEmptyString,
  isDaily: Schema.Boolean,
  type: Type,
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  createdAt: Schema.DateTimeUtc,
});

export const Create = Record.omit("localSeq");
