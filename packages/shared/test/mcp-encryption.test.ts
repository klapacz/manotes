import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { Aead, SecureRandom } from "effect/crypto";
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { afterAll, expect, it } from "vite-plus/test";
import { McpEncryption } from "../src/mcp/encryption";

const runtime = ManagedRuntime.make(
  Aead.layerWebCrypto.pipe(Layer.provideMerge(SecureRandom.layerWebCrypto)),
);

afterAll(() => runtime.dispose());

it("generates fresh 32-byte keys and round-trips encrypted text", async () => {
  const first = await runtime.runPromise(McpEncryption.generateKey());
  const second = await runtime.runPromise(McpEncryption.generateKey());

  expect(first.length).toBe(32);
  expect(second.length).toBe(32);
  expect(second).not.toEqual(first);

  const plaintext = JSON.stringify({ script: "console.log('cześć 👋')", iat: 1_700_000_000 });
  const aad = "request:req-1";

  const envelope = await runtime.runPromise(McpEncryption.encrypt({ key: first, plaintext, aad }));

  expect(envelope.version).toBe(0);
  expect(envelope.iv.length).toBe(12);

  const wire = Schema.encodeSync(McpEncryption.EnvelopeFromJson)(envelope);
  const decoded = Schema.decodeSync(McpEncryption.EnvelopeFromJson)(wire);

  expect(
    await runtime.runPromise(McpEncryption.decrypt({ key: first, envelope: decoded, aad })),
  ).toBe(plaintext);
});

it("rejects wrong key, mismatched aad, tampered envelope, and invalid utf-8", async () => {
  const key = await runtime.runPromise(McpEncryption.generateKey());
  const otherKey = await runtime.runPromise(McpEncryption.generateKey());
  const aad = "request:req-1";

  const envelope = await runtime.runPromise(
    McpEncryption.encrypt({ key, plaintext: "secret", aad }),
  );

  const badIv = new Uint8Array(envelope.iv);
  badIv[0] = (badIv[0] ?? 0) ^ 0xff;

  const badCiphertext = new Uint8Array(envelope.ciphertext);
  badCiphertext[0] = (badCiphertext[0] ?? 0) ^ 0xff;

  for (const input of [
    { key: otherKey, envelope, aad },
    { key, envelope, aad: "answer:req-1" },
    { key, envelope, aad: "request:req-2" },
    { key, envelope: { ...envelope, iv: badIv }, aad },
    { key, envelope: { ...envelope, ciphertext: badCiphertext }, aad },
  ]) {
    const error = await runtime.runPromise(McpEncryption.decrypt(input).pipe(Effect.flip));
    expect(error).toBeInstanceOf(McpEncryption.DecryptionError);
  }

  // Encrypt raw invalid UTF-8 bytes directly with node:crypto and verify decrypt rejects them.
  const iv = new Uint8Array(12).fill(7);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));

  const ciphertext = new Uint8Array(
    Buffer.concat([cipher.update(Buffer.from([0xff, 0xfe])), cipher.final(), cipher.getAuthTag()]),
  );

  const utf8Error = await runtime.runPromise(
    McpEncryption.decrypt({ key, envelope: { version: 0, iv, ciphertext }, aad }).pipe(Effect.flip),
  );

  expect(utf8Error).toBeInstanceOf(McpEncryption.DecryptionError);
});

it("interoperates with bare node:crypto aes-256-gcm in both directions", async () => {
  const key = await runtime.runPromise(McpEncryption.generateKey());
  const aad = "request:interop-1";
  const plaintext = "hello from bare node";

  // Node -> McpEncryption.decrypt
  const iv = new Uint8Array(12).fill(3);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));

  const ciphertext = new Uint8Array(
    Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]),
  );

  expect(
    await runtime.runPromise(
      McpEncryption.decrypt({ key, envelope: { version: 0, iv, ciphertext }, aad }),
    ),
  ).toBe(plaintext);

  // McpEncryption.encrypt -> Node
  const answerAad = "answer:interop-1";
  const answerText = JSON.stringify({ output: ["ok"], error: null });

  const envelope = await runtime.runPromise(
    McpEncryption.encrypt({ key, plaintext: answerText, aad: answerAad }),
  );

  const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
  decipher.setAAD(Buffer.from(answerAad));
  decipher.setAuthTag(envelope.ciphertext.subarray(-16));

  const opened = Buffer.concat([
    decipher.update(envelope.ciphertext.subarray(0, -16)),
    decipher.final(),
  ]).toString("utf8");

  expect(opened).toBe(answerText);
});
