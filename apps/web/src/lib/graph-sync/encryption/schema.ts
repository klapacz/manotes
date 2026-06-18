import { Msgpack } from "effect/unstable/encoding";
import { Schema } from "effect";
import * as EventSchema from "../../event.schema";

export const EnvelopeSchema = Schema.Struct({
  version: Schema.Literals([0]),
  iv: Schema.Uint8ArrayFromBase64,
  ciphertext: Schema.Uint8ArrayFromBase64,
});
export type Envelope = Schema.Schema.Type<typeof EnvelopeSchema>;

const EnvelopeMsgPack = Msgpack.schema(EnvelopeSchema);
export const decodeEnvelope = Schema.decodeEffect(EnvelopeMsgPack);
export const encodeEnvelope = Schema.encodeEffect(EnvelopeMsgPack);

export const BodySchema = Schema.Struct({
  noteId: Schema.NonEmptyString,
  type: EventSchema.Type,
  payload: Schema.Uint8Array,
});
export type Body = Schema.Schema.Type<typeof BodySchema>;

const BodyMsgPack = Msgpack.schema(BodySchema);
export const decodeBody = Schema.decodeEffect(BodyMsgPack);
export const encodeBody = Schema.encodeEffect(BodyMsgPack);

export type CreatedAt = Schema.Schema.Type<typeof Schema.DateTimeUtc>;

export const AuthenticatedMetadataSchema = Schema.Struct({
  version: Schema.Literals([0]),
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8Array,
  createdAt: Schema.DateTimeUtcFromString,
});
export type AuthenticatedMetadata = Schema.Schema.Type<typeof AuthenticatedMetadataSchema>;

const AuthenticatedMetadataMsgPack = Msgpack.schema(AuthenticatedMetadataSchema);
export const encodeAuthenticatedMetadata = Schema.encodeEffect(AuthenticatedMetadataMsgPack);
