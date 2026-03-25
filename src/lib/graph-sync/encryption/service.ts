import { Data, Effect } from "effect";
import { castArray } from "../../graph-encryption";
import * as GraphSyncContext from "../context";
import * as EncryptionSchema from "./schema";

export class StreamRefDerivationError extends Data.TaggedError(
  "GraphSyncEncryption.StreamRefDerivationError",
)<{ cause: unknown }> {}

export class EventEncryptionError extends Data.TaggedError(
  "GraphSyncEncryption.EventEncryptionError",
)<{ cause: unknown }> {}

export class InvalidEncryptedEventError extends Data.TaggedError(
  "GraphSyncEncryption.InvalidEncryptedEventError",
)<{ cause: unknown }> {}

export class Service extends Effect.Service<Service>()(
  "GraphSyncEncryption.Service",
  {
    effect: Effect.gen(function* () {
      const context = yield* GraphSyncContext.Context;
      const graphKey = castArray(context.graphKey);

      const streamRefKey = yield* Effect.tryPromise({
        try: () =>
          crypto.subtle.importKey(
            "raw",
            graphKey,
            {
              name: "HMAC",
              hash: "SHA-256",
            },
            false,
            ["sign"],
          ),
        catch: (cause) => new StreamRefDerivationError({ cause }),
      });

      const eventEncryptionKey = yield* Effect.tryPromise({
        try: () =>
          crypto.subtle.importKey("raw", graphKey, "AES-GCM", false, [
            "encrypt",
            "decrypt",
          ]),
        catch: (cause) => new EventEncryptionError({ cause }),
      });

      const deriveNoteStreamRef = Effect.fn(
        "GraphSyncEncryptionService.deriveNoteStreamRef",
      )(function* (noteId: string) {
        const signature = yield* Effect.tryPromise({
          try: () =>
            crypto.subtle.sign(
              "HMAC",
              streamRefKey,
              encodeStreamRefInput(noteId),
            ),
          catch: (cause) => new StreamRefDerivationError({ cause }),
        });

        return new Uint8Array(signature);
      });

      const encryptEventBody = Effect.fn(
        "GraphSyncEncryptionService.encryptEventBody",
      )(function* ({
        id,
        streamRef,
        createdAt,
        noteId,
        payload,
      }: {
        id: string;
        streamRef: Uint8Array<ArrayBufferLike>;
        createdAt: EncryptionSchema.CreatedAt;
        noteId: string;
        payload: Uint8Array<ArrayBufferLike>;
      }) {
        const authenticatedMetadata = yield* remapError(
          EncryptionSchema.encodeAuthenticatedMetadata({
            version: 0,
            id,
            streamRef: castArray(streamRef),
            createdAt,
          }),
          (cause) => new EventEncryptionError({ cause }),
        );

        const body = yield* remapError(
          EncryptionSchema.encodeBody({
            noteId,
            payload,
          }),
          (cause) => new EventEncryptionError({ cause }),
        );

        const iv = crypto.getRandomValues(new Uint8Array(EVENT_IV_LENGTH));
        const ciphertext = yield* Effect.tryPromise({
          try: () =>
            crypto.subtle.encrypt(
              {
                name: "AES-GCM",
                iv,
                additionalData: castArray(authenticatedMetadata),
              },
              eventEncryptionKey,
              castArray(body),
            ),
          catch: (cause) => new EventEncryptionError({ cause }),
        });

        return {
          version: 0,
          iv,
          ciphertext: new Uint8Array(ciphertext),
        } satisfies EncryptionSchema.Envelope;
      });

      const decryptEventBody = Effect.fn(
        "GraphSyncEncryptionService.decryptEventBody",
      )(function* ({
        id,
        streamRef,
        createdAt,
        envelope,
      }: {
        id: string;
        streamRef: Uint8Array<ArrayBufferLike>;
        createdAt: EncryptionSchema.CreatedAt;
        envelope: EncryptionSchema.Envelope;
      }) {
        const authenticatedMetadata = yield* remapError(
          EncryptionSchema.encodeAuthenticatedMetadata({
            version: envelope.version,
            id,
            streamRef: castArray(streamRef),
            createdAt,
          }),
          (cause) => new InvalidEncryptedEventError({ cause }),
        );

        const decrypted = yield* Effect.tryPromise({
          try: () =>
            crypto.subtle.decrypt(
              {
                name: "AES-GCM",
                iv: castArray(envelope.iv),
                additionalData: castArray(authenticatedMetadata),
              },
              eventEncryptionKey,
              castArray(envelope.ciphertext),
            ),
          catch: (cause) => new InvalidEncryptedEventError({ cause }),
        });

        return yield* remapError(
          EncryptionSchema.decodeBody(new Uint8Array(decrypted)),
          (cause) => new InvalidEncryptedEventError({ cause }),
        );
      });

      return {
        deriveNoteStreamRef,
        encryptEventBody,
        decryptEventBody,
      };
    }),
  },
) {}

// AES-GCM requires a unique IV for each encryption operation under the same
// key. Event payload encryption reuses one graph key for the whole sync session,
// so every encrypted event gets its own fresh IV.
const EVENT_IV_LENGTH = 12;

// This label gives the HMAC input its own namespace. It prevents accidental
// reuse of the same graph-key bytes for some other deterministic hash input
// format later.
const STREAM_REF_CONTEXT = "manotes/graph-sync/stream-ref/v0";

function encodeStreamRefInput(noteId: string) {
  return textEncoder.encode(`${STREAM_REF_CONTEXT}:${noteId}`);
}

const textEncoder = new TextEncoder();

function remapError<A, E, E2>(
  effect: Effect.Effect<A, E>,
  mapError: (cause: E) => E2,
): Effect.Effect<A, E2> {
  return effect.pipe(Effect.mapError(mapError));
}
