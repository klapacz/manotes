import { Schema } from "effect";
import * as GraphEncryption from "@manotes/shared/graph-encryption";

export const Status = Schema.Literals(["active", "deleting"]);
export type Status = Schema.Schema.Type<typeof Status>;

const CloudRecord = Schema.Struct({
  localGraphId: Schema.String,
  displayName: Schema.String,
  status: Status,
  mode: Schema.Literals(["cloud"]),
  graphId: Schema.String,
  accountId: Schema.String,
  graphKeyEnvelope: Schema.fromJsonString(GraphEncryption.GraphKeyEnvelopeSchema),
});
export type CloudRecord = Schema.Schema.Type<typeof CloudRecord>;

const LocalRecord = Schema.Struct({
  localGraphId: Schema.String,
  displayName: Schema.String,
  status: Status,
  mode: Schema.Literals(["local"]),
  graphId: Schema.Null,
  accountId: Schema.Null,
  graphKeyEnvelope: Schema.Null,
});
export type LocalRecord = Schema.Schema.Type<typeof LocalRecord>;

export const Record = Schema.Union([CloudRecord, LocalRecord]);

export type Record = Schema.Schema.Type<typeof Record>;
export type RawRecord = typeof Record.Encoded;

export const encodeRecord = Schema.encodeEffect(Record);
export const decodeRecord = Schema.decodeEffect(Record);
export const decodeArray = Schema.decodeEffect(Schema.Array(Record));
