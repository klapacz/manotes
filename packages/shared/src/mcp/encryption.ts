import { Data, Effect, Schema } from "effect";
import { Aead, SecureRandom } from "effect/crypto";

export const KEY_LENGTH = 32;

export const IV_LENGTH = 12;

export const EnvelopeSchema = Schema.Struct({
  version: Schema.Literal(0),
  iv: Schema.Uint8ArrayFromBase64,
  ciphertext: Schema.Uint8ArrayFromBase64,
});

export const EnvelopeFromJson = Schema.fromJsonString(EnvelopeSchema);

export type Envelope = typeof EnvelopeSchema.Type;

export class EncryptionError extends Data.TaggedError("McpEncryption.EncryptionError")<{
  readonly cause: unknown;
}> {}

export class DecryptionError extends Data.TaggedError("McpEncryption.DecryptionError")<{
  readonly cause: unknown;
}> {}

export const generateKey = Effect.fn("McpEncryption.generateKey")(function* () {
  const random = yield* SecureRandom.SecureRandom;

  return yield* random.randomBytes(KEY_LENGTH);
});

export const encrypt = Effect.fn("McpEncryption.encrypt")(function* ({
  key,
  plaintext,
  aad,
}: {
  readonly key: Uint8Array;
  readonly plaintext: string;
  readonly aad: string;
}) {
  const aead = yield* Aead.Aead;
  const random = yield* SecureRandom.SecureRandom;

  const aeadKey = yield* Aead.key(Aead.aes256Gcm, key).pipe(
    Effect.mapError((cause) => new EncryptionError({ cause })),
  );

  const iv = yield* random.randomBytes(IV_LENGTH);

  const ciphertext = yield* aead
    .encrypt(aeadKey, textEncoder.encode(plaintext), {
      nonce: iv,
      aad: textEncoder.encode(aad),
    })
    .pipe(Effect.mapError((cause) => new EncryptionError({ cause })));

  return {
    version: 0,
    iv,
    ciphertext,
  } satisfies Envelope;
});

export const decrypt = Effect.fn("McpEncryption.decrypt")(function* ({
  key,
  envelope,
  aad,
}: {
  readonly key: Uint8Array;
  readonly envelope: Envelope;
  readonly aad: string;
}) {
  const aead = yield* Aead.Aead;

  const aeadKey = yield* Aead.key(Aead.aes256Gcm, key).pipe(
    Effect.mapError((cause) => new DecryptionError({ cause })),
  );

  const decrypted = yield* aead
    .decrypt(aeadKey, envelope.ciphertext, {
      nonce: envelope.iv,
      aad: textEncoder.encode(aad),
    })
    .pipe(Effect.mapError((cause) => new DecryptionError({ cause })));

  return yield* Effect.try({
    try: () => textDecoder.decode(decrypted),
    catch: (cause) => new DecryptionError({ cause }),
  });
});

const textEncoder = new TextEncoder();

const textDecoder = new TextDecoder("utf-8", { fatal: true });

export * as McpEncryption from "./encryption";
