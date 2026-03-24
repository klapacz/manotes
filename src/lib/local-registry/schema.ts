import { Schema } from "effect";
import * as GraphEncryption from "../graph-encryption";

export const Record = Schema.Struct({
  localGraphId: Schema.String,
  displayName: Schema.String,
  origin: Schema.Literal("local", "cloud"),
  graphId: Schema.Union(Schema.String, Schema.Null),
  accountId: Schema.Union(Schema.String, Schema.Null),
  graphKeyEnvelope: Schema.Union(
    Schema.parseJson(GraphEncryption.GraphKeyEnvelopeSchema),
    Schema.Null,
  ),
});

export type Record = Schema.Schema.Type<typeof Record>;
export type RawRecord = Schema.Schema.Encoded<typeof Record>;

export const encodeRecord = Schema.encode(Record);
export const decodeRecord = Schema.decode(Record);
export const decodeArray = Schema.decode(Schema.Array(Record));
