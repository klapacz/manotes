import { Aead, Mac, SecureRandom } from "effect/crypto";
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { DateTime, Effect, Layer } from "effect";
import { expect, it } from "vite-plus/test";
import { RecordSchema } from "../src/record.schema";
import { GraphSyncContext } from "../src/graph-sync/context";
import { GraphSyncEncryptionSchema } from "../src/graph-sync/encryption/schema";
import { GraphSyncEncryption } from "../src/graph-sync/encryption/service";

it("preserves stream references and version 0 event ciphertext in both directions", async () => {
  const graphKey = new Uint8Array(32).fill(42);

  await Effect.runPromise(
    Effect.gen(function* () {
      const encryption = yield* GraphSyncEncryption.Service;
      const recordId = RecordSchema.Id.make("record-1");
      const streamRef = yield* encryption.deriveRecordStreamRef(recordId);

      const expectedRef = createHmac("sha256", graphKey)
        .update(`manotes/graph-sync/stream-ref/v0:${recordId}`)
        .digest();

      expect(streamRef).toEqual(new Uint8Array(expectedRef));

      const metadata = {
        version: 0,
        id: "event-1",
        streamRef,
        createdAt: DateTime.makeUnsafe("2026-11-26T12:00:00Z"),
      } as const;

      const body = { recordId, type: "update", payload: new Uint8Array([1, 2, 3]) } as const;
      const aad = yield* GraphSyncEncryptionSchema.encodeAuthenticatedMetadata(metadata);
      const plaintext = yield* GraphSyncEncryptionSchema.encodeBody(body);
      const iv = new Uint8Array(12).fill(1);
      const cipher = createCipheriv("aes-256-gcm", graphKey, iv);
      cipher.setAAD(aad);

      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
        cipher.getAuthTag(),
      ]);

      const legacyEnvelope = { version: 0, iv, ciphertext } as const;

      // Exercise the stored envelope's MessagePack/base64 decoding too.
      const envelope = yield* GraphSyncEncryptionSchema.decodeEnvelope(
        yield* GraphSyncEncryptionSchema.encodeEnvelope(legacyEnvelope),
      );

      expect(yield* encryption.decryptEventBody({ ...metadata, envelope })).toEqual(body);

      const sealed = yield* encryption.encryptEventBody({ ...metadata, ...body });
      const decipher = createDecipheriv("aes-256-gcm", graphKey, sealed.iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(sealed.ciphertext.subarray(-16));

      const opened = Buffer.concat([
        decipher.update(sealed.ciphertext.subarray(0, -16)),
        decipher.final(),
      ]);

      expect(new Uint8Array(opened)).toEqual(plaintext);
      expect(yield* encryption.decryptEventBody({ ...metadata, envelope: sealed })).toEqual(body);
      expect((yield* encryption.encryptEventBody({ ...metadata, ...body })).iv).not.toEqual(
        sealed.iv,
      );

      for (const input of [
        { ...metadata, envelope, id: "event-2" },
        { ...metadata, envelope, streamRef: new Uint8Array(32) },
        { ...metadata, envelope, createdAt: DateTime.makeUnsafe("2026-11-27T12:00:00Z") },
        { ...metadata, envelope: { ...envelope, iv: new Uint8Array(12) } },
        { ...metadata, envelope: { ...envelope, ciphertext: new Uint8Array(ciphertext.length) } },
      ]) {
        const error = yield* encryption.decryptEventBody(input).pipe(Effect.flip);
        expect(error).toBeInstanceOf(GraphSyncEncryption.InvalidEncryptedEventError);
      }
    }).pipe(
      Effect.provide(GraphSyncEncryption.Service.layer),
      Effect.provide(
        Layer.mergeAll(Aead.layerWebCrypto, Mac.layerWebCrypto).pipe(
          Layer.provideMerge(SecureRandom.layerWebCrypto),
        ),
      ),
      Effect.provideService(GraphSyncContext.Context, { graphId: "graph-1", graphKey }),
    ),
  );
});
