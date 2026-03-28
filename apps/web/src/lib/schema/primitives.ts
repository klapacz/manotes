import { Schema, SchemaGetter } from "effect";

export const BooleanFromInt = Schema.Number.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value: number) => value !== 0),
    encode: SchemaGetter.transform((value: boolean) => (value ? 1 : 0)),
  }),
);
