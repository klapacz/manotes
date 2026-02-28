import { Schema } from "effect";

export const Type = Schema.Literal("create", "update");

export const Record = Schema.Struct({
  id: Schema.Number,
  noteId: Schema.NonEmptyString,
  isDaily: Schema.Boolean,
  type: Type,
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  timestamp: Schema.DateTimeUtc,
});

export const Create = Record.omit("id");
