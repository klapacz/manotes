import { Aead, Kdf, SecureRandom } from "effect/crypto";
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, pbkdf2Sync } from "node:crypto";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { afterAll, expect, it } from "vite-plus/test";
import { GraphEncryption } from "../src/graph-encryption";

const runtime = ManagedRuntime.make(
  Layer.mergeAll(Aead.layerWebCrypto, Kdf.layerWebCrypto).pipe(
    Layer.provideMerge(SecureRandom.layerWebCrypto),
  ),
);

afterAll(() => runtime.dispose());

it("opens stored version 0 keys and preserves invalid-password errors", async () => {
  const password = "graph password";
  const graphKey = new Uint8Array(32).fill(42);
  const salt = new Uint8Array(16).fill(1);
  const wrappingIv = new Uint8Array(12).fill(2);
  const iterations = 1_000;
  const key = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, wrappingIv);

  const wrappedGraphKey = Buffer.concat([
    cipher.update(graphKey),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const envelope = { version: 0, iterations, salt, wrappingIv, wrappedGraphKey } as const;
  const stored = Schema.encodeSync(GraphEncryption.GraphKeyEnvelopeSchema)(envelope);
  const decoded = Schema.decodeSync(GraphEncryption.GraphKeyEnvelopeSchema)(stored);

  expect(
    await runtime.runPromise(GraphEncryption.unwrapGraphKey({ password, envelope: decoded })),
  ).toEqual(graphKey);

  for (const input of [
    { password: "wrong", envelope: decoded },
    { password, envelope: { ...decoded, iterations: 0 } },
    { password, envelope: { ...decoded, wrappingIv: new Uint8Array(12) } },
    { password, envelope: { ...decoded, wrappedGraphKey: new Uint8Array(wrappedGraphKey.length) } },
  ]) {
    const error = await runtime.runPromise(GraphEncryption.unwrapGraphKey(input).pipe(Effect.flip));
    expect(error).toBeInstanceOf(GraphEncryption.InvalidPasswordError);
  }
});

it("creates fresh graph keys with the existing PBKDF2 and AES-GCM format", async () => {
  const password = "graph password";
  const first = await runtime.runPromise(GraphEncryption.createGraphKey(password));
  const second = await runtime.runPromise(GraphEncryption.createGraphKey(password));
  const { envelope, graphKey } = first;
  expect(envelope.version).toBe(0);
  expect(envelope.iterations).toBe(600_000);
  expect(envelope.salt.length).toBe(16);
  expect(envelope.wrappingIv.length).toBe(12);
  expect(envelope.wrappedGraphKey.length).toBe(48);
  expect(graphKey.length).toBe(32);
  expect(second.graphKey).not.toEqual(graphKey);
  expect(second.envelope.salt).not.toEqual(envelope.salt);
  expect(second.envelope.wrappingIv).not.toEqual(envelope.wrappingIv);

  const key = pbkdf2Sync(password, envelope.salt, envelope.iterations, 32, "sha256");
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.wrappingIv);
  decipher.setAuthTag(envelope.wrappedGraphKey.subarray(-16));

  const opened = Buffer.concat([
    decipher.update(envelope.wrappedGraphKey.subarray(0, -16)),
    decipher.final(),
  ]);

  expect(new Uint8Array(opened)).toEqual(graphKey);
  expect(await runtime.runPromise(GraphEncryption.unwrapGraphKey({ password, envelope }))).toEqual(
    graphKey,
  );
});
