import { Schema } from "effect";

// ============================================================================
// Schema
// ============================================================================

export const GraphKeyEnvelopeSchema = Schema.Struct({
  version: Schema.Literal(0),
  iterations: Schema.Number,
  salt: Schema.Uint8ArrayFromBase64,
  wrappingIv: Schema.Uint8ArrayFromBase64,
  wrappedGraphKey: Schema.Uint8ArrayFromBase64,
});

export type GraphKeyEnvelope = Schema.Schema.Type<
  typeof GraphKeyEnvelopeSchema
>;

// ============================================================================
// Config & Errors
// ============================================================================

export class InvalidPasswordError extends Error {
  constructor() {
    super("Invalid graph password.");
  }
}

// Every synced graph gets one random symmetric key.
//
// This is the long-lived secret for the graph itself. The user's password does
// not become the graph key. Instead, the password is only used to derive a
// temporary wrapping key that encrypts this random graph key for storage.
//
// That separation matters because it lets us change the graph password later by
// re-wrapping the same graph key instead of re-encrypting every synced event.
const GRAPH_KEY_LENGTH = 32;

// PBKDF2 makes password guessing more expensive. The derived output is used as
// an AES-GCM wrapping key, not as note/content encryption material directly.
const PBKDF2_ITERATIONS = 600_000;

// Salt ensures that even if two graphs use the same password, they still get
// different derived wrapping keys.
const SALT_LENGTH = 16;

// AES-GCM requires a unique IV for each encryption operation under the same
// key. Here it belongs to the one wrapping operation that encrypts the graph
// key for storage.
const IV_LENGTH = 12;

// ============================================================================
// Core functions
// ============================================================================

// Creates the encrypted bootstrap material for a brand new synced graph.
//
// Output:
// - `graphKey`: the raw random key for the current session to keep in memory
// - `wrapped`: the serialized form that can be stored remotely/localy and used
//   later to unlock the graph from the password
//
// Flow:
// 1. generate a random graph key
// 2. derive a wrapping key from password + salt
// 3. encrypt the graph key with AES-GCM
// 4. return the encrypted bytes plus the metadata needed to repeat step 2/3
export async function createGraphKey(password: string): Promise<{
  graphKey: Uint8Array<ArrayBuffer>;
  envelope: GraphKeyEnvelope;
}> {
  const graphKey = crypto.getRandomValues(new Uint8Array(GRAPH_KEY_LENGTH));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const wrappingIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const passwordKey = await derivePasswordKey(password, salt);
  const wrappingKey = await crypto.subtle.importKey(
    "raw",
    passwordKey,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const wrappedGraphKey = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: wrappingIv,
    },
    wrappingKey,
    graphKey,
  );

  return {
    graphKey,
    envelope: {
      version: 0,
      iterations: PBKDF2_ITERATIONS,
      salt,
      wrappingIv,
      wrappedGraphKey: new Uint8Array(wrappedGraphKey),
    },
  };
}

// Reconstructs the raw graph key for an existing graph.
//
// We derive the same wrapping key from the provided password and stored salt,
// then ask AES-GCM to decrypt the stored wrapped graph key. If the password is
// wrong, authentication fails and Web Crypto throws.
//
// The caller only gets a domain-level `InvalidPasswordError`, not the raw
// crypto exception, because the UI only needs to know that unlock failed.
export async function unwrapGraphKey({
  password,
  envelope,
}: {
  password: string;
  envelope: GraphKeyEnvelope;
}): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const passwordKey = await derivePasswordKey(
      password,
      castArray(envelope.salt),
      envelope.iterations,
    );
    const wrappingKey = await crypto.subtle.importKey(
      "raw",
      passwordKey,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: castArray(envelope.wrappingIv),
      },
      wrappingKey,
      castArray(envelope.wrappedGraphKey),
    );

    return new Uint8Array(decrypted);
  } catch {
    throw new InvalidPasswordError();
  }
}

// Turns a human password into fixed-length key material suitable for AES-GCM.
//
// Important distinction:
// - password: low-entropy user input
// - derived bits: cryptographic key material used only for wrapping/unwrapping
// - graph key: separate random secret used for graph content encryption
async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    GRAPH_KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}

// ============================================================================
// Helpers
// ============================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Effect Schema's `Uint8ArrayFromBase64` decodes to `Uint8Array<ArrayBufferLike>`.
 *
 * That is correct at runtime, but Web Crypto's TypeScript overloads are
 * stricter and only accept typed arrays backed by `ArrayBuffer`.
 *
 * So this cast exists only to satisfy the browser typings at the exact
 * `crypto.subtle` boundary. It does not transform or copy the bytes.
 */
export function castArray(
  arrayBufferLike: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  return arrayBufferLike as Uint8Array<ArrayBuffer>;
}

// Normalizes password input before any KDF work.
//
// The UTF-8 round-trip makes the byte representation explicit, and trimming
// avoids accidental leading/trailing spaces becoming part of the password.
export function normalizePassword(password: string) {
  return textDecoder.decode(textEncoder.encode(password)).trim();
}
