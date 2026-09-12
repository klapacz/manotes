import { Schema, SchemaGetter, Struct } from "effect";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";

export const Record = Schema.Struct({
  commitSeq: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8Array,
  // Opaque encrypted event-envelope bytes. The server never decrypts them.
  payload: Schema.instanceOf(Uint8Array<ArrayBufferLike>),
  createdAt: Schema.DateTimeUtcFromString,
});

export const CommittedEventFromRecord = Record.pipe(
  Schema.decodeTo(Schema.toType(Messages.CommittedEvent), {
    decode: SchemaGetter.transform((record) => new Messages.CommittedEvent(record)),
    encode: SchemaGetter.passthrough({ strict: false }),
  }),
);

export const CreateRecord = Record.mapFields(Struct.omit(["commitSeq"]));

export type RawRecord = typeof Record.Encoded;

export type RawCreateRecord = typeof CreateRecord.Encoded;

export const decodeNonEmptyArray = Schema.decodeEffect(
  Schema.NonEmptyArray(CommittedEventFromRecord),
);

export const decodeArray = Schema.decodeEffect(Schema.Array(CommittedEventFromRecord));

export const encodeCreateRecords = Schema.encodeEffect(Schema.Array(CreateRecord));
