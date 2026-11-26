import { Effect, Schema } from "effect";
import { Aead, Digest, Kdf, SecureRandom } from "effect/crypto";

export const GraphKeyEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(0),
  iterations: Schema.Number,
  salt: Schema.Uint8ArrayFromBase64,
  wrappingIv: Schema.Uint8ArrayFromBase64,
  wrappedGraphKey: Schema.Uint8ArrayFromBase64,
});

export const PasswordSchema = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()));

export type GraphKeyEnvelope = Schema.Schema.Type<typeof GraphKeyEnvelopeSchema>;

export class InvalidPasswordError extends Error {
  constructor() {
    super("Invalid graph password.");
  }
}

// Keep version 0's AES-256-GCM and PBKDF2-SHA256 parameters compatible with stored graphs.
const GRAPH_KEY_LENGTH = 32;

const PBKDF2_ITERATIONS = 600_000;

const SALT_LENGTH = 16;

const IV_LENGTH = 12;

// The password wraps a separate random graph key, so password changes need only rewrap that key.
export const createGraphKey = Effect.fn("GraphEncryption.createGraphKey")(function* (
  password: string,
) {
  const aead = yield* Aead.Aead;
  const random = yield* SecureRandom.SecureRandom;
  const graphKey = yield* random.randomBytes(GRAPH_KEY_LENGTH);
  const salt = yield* random.randomBytes(SALT_LENGTH);
  const wrappingIv = yield* random.randomBytes(IV_LENGTH);
  const wrappingKey = yield* derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  const wrappedGraphKey = yield* aead.encrypt(wrappingKey, graphKey, { nonce: wrappingIv });

  return {
    graphKey,
    envelope: {
      version: 0,
      iterations: PBKDF2_ITERATIONS,
      salt,
      wrappingIv,
      wrappedGraphKey,
    } satisfies GraphKeyEnvelope,
  };
});

export const unwrapGraphKey = Effect.fn("GraphEncryption.unwrapGraphKey")(
  function* ({ password, envelope }: { password: string; envelope: GraphKeyEnvelope }) {
    const aead = yield* Aead.Aead;
    const wrappingKey = yield* derivePasswordKey(password, envelope.salt, envelope.iterations);

    return yield* aead.decrypt(wrappingKey, envelope.wrappedGraphKey, {
      nonce: envelope.wrappingIv,
    });
  },
  Effect.mapError(() => new InvalidPasswordError()),
);

const derivePasswordKey = Effect.fn("GraphEncryption.derivePasswordKey")(function* (
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const kdf = yield* Kdf.Kdf;

  const bytes = yield* kdf.derive(
    Kdf.pbkdf2({ hash: Digest.sha256, iterations }),
    textEncoder.encode(password),
    { salt, length: GRAPH_KEY_LENGTH },
  );

  return yield* Aead.key(Aead.aes256Gcm, bytes);
});

const textEncoder = new TextEncoder();

const textDecoder = new TextDecoder();

// Preserve the UTF-8 round-trip and trimming used for existing passwords.
export function normalizePassword(password: string) {
  return textDecoder.decode(textEncoder.encode(password)).trim();
}

export * as GraphEncryption from "./graph-encryption";
