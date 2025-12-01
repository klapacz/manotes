import { Schema } from "effect";

export const Type = Schema.Literal("create", "update");

export const Record = Schema.Struct({
  id: Schema.Number,
  type: Type,
  payload: Schema.instanceOf(Uint8Array),
  timestamp: Schema.DateTimeUtc,
});

export const Create = Record.omit("id");
