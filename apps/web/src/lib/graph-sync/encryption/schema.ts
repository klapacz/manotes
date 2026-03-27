import * as MsgPack from "@effect/platform/MsgPack";
import { Schema } from "effect";

export const EnvelopeSchema = Schema.Struct({
  version: Schema.Literal(0),
  iv: Schema.Uint8ArrayFromBase64,
  ciphertext: Schema.Uint8ArrayFromBase64,
});
export type Envelope = Schema.Schema.Type<typeof EnvelopeSchema>;

const EnvelopeMsgPack = MsgPack.schema(EnvelopeSchema);
export const decodeEnvelope = Schema.decode(EnvelopeMsgPack);
export const encodeEnvelope = Schema.encode(EnvelopeMsgPack);

export const BodySchema = Schema.Struct({
  noteId: Schema.NonEmptyString,
  payload: Schema.Uint8ArrayFromSelf,
});
export type Body = Schema.Schema.Type<typeof BodySchema>;

const BodyMsgPack = MsgPack.schema(BodySchema);
export const decodeBody = Schema.decode(BodyMsgPack);
export const encodeBody = Schema.encode(BodyMsgPack);

export type CreatedAt = Schema.Schema.Type<typeof Schema.DateTimeUtc>;

export const AuthenticatedMetadataSchema = Schema.Struct({
  version: Schema.Literal(0),
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8ArrayFromSelf,
  createdAt: Schema.DateTimeUtc,
});
export type AuthenticatedMetadata = Schema.Schema.Type<typeof AuthenticatedMetadataSchema>;

const AuthenticatedMetadataMsgPack = MsgPack.schema(AuthenticatedMetadataSchema);
export const encodeAuthenticatedMetadata = Schema.encode(AuthenticatedMetadataMsgPack);
