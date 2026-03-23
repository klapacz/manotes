import { Schema } from "effect";

export const Record = Schema.Struct({
  localGraphId: Schema.String,
  displayName: Schema.String,
  origin: Schema.Literal("local"),
  graphId: Schema.Null,
  accountId: Schema.Null,
});

export type Record = typeof Record.Type;

export const encodeRecord = Schema.encode(Record);
export const decodeRecord = Schema.decode(Record);
export const decodeArray = Schema.decode(Schema.Array(Record));
