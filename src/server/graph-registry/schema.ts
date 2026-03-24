import { Schema } from "effect";

export const DisplayNameSchema = Schema.Trim.pipe(Schema.nonEmptyString());

export const Record = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
});

export type Record = typeof Record.Type;

export const decodeRecord = Schema.decode(Record);
export const decodeArray = Schema.decode(Schema.Array(Record));
