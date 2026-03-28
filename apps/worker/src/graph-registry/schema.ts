import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { Schema } from "effect";

export const DisplayNameSchema = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()));

export const Record = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
  graphKeyEnvelope: Schema.fromJsonString(GraphEncryption.GraphKeyEnvelopeSchema),
});

export type Record = typeof Record.Type;
export type RawRecord = typeof Record.Encoded;

export const encodeRecord = Schema.encodeEffect(Record);
export const decodeRecord = Schema.decodeEffect(Record);
export const decodeArray = Schema.decodeEffect(Schema.Array(Record));
