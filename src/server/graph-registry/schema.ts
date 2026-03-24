import * as GraphEncryption from "../../lib/graph-encryption";
import { Schema } from "effect";

export const DisplayNameSchema = Schema.Trim.pipe(Schema.nonEmptyString());

export const Record = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
  graphKeyEnvelope: Schema.parseJson(GraphEncryption.GraphKeyEnvelopeSchema),
});

export type Record = Schema.Schema.Type<typeof Record>;
export type RawRecord = Schema.Schema.Encoded<typeof Record>;

export const encodeRecord = Schema.encode(Record);
export const decodeRecord = Schema.decode(Record);
export const decodeArray = Schema.decode(Schema.Array(Record));

export const ApiRecord = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelopeSchema,
});

export const encodeApiRecord = Schema.encode(ApiRecord);
export const encodeApiArray = Schema.encode(Schema.Array(ApiRecord));
