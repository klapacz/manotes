import { Schema } from "effect";
import * as GraphEncryption from "../graph-encryption";

export const Record = Schema.Union(
  Schema.Struct({
    localGraphId: Schema.String,
    displayName: Schema.String,
    mode: Schema.Literal("local"),
    graphId: Schema.Null,
    accountId: Schema.Null,
    graphKeyEnvelope: Schema.Null,
  }),
  Schema.Struct({
    localGraphId: Schema.String,
    displayName: Schema.String,
    mode: Schema.Literal("cloud"),
    graphId: Schema.String,
    accountId: Schema.String,
    graphKeyEnvelope: Schema.parseJson(GraphEncryption.GraphKeyEnvelopeSchema),
  }),
);

export type Record = Schema.Schema.Type<typeof Record>;
export type RawRecord = Schema.Schema.Encoded<typeof Record>;

export const encodeRecord = Schema.encode(Record);
export const decodeRecord = Schema.decode(Record);
export const decodeArray = Schema.decode(Schema.Array(Record));
