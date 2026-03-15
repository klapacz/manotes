import { Schema } from "effect";

export const BooleanFromInt = Schema.transform(Schema.Number, Schema.Boolean, {
  strict: true,
  decode: (value) => value !== 0,
  encode: (value) => (value ? 1 : 0),
});
