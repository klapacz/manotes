import crypto from "node:crypto";
import fs from "node:fs";

const pairingPath = new URL("../pairing.json", import.meta.url);

const { key: keyBase64 } = JSON.parse(fs.readFileSync(pairingPath, "utf8"));

const key = Buffer.from(keyBase64, "base64");

const [command, arg] = process.argv.slice(2);

if (command === "seal" && arg) {
  const script = fs.readFileSync(arg, "utf8");
  const requestId = crypto.randomUUID();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`request:${requestId}`));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ script }), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const envelope = JSON.stringify({
    version: 0,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });

  process.stdout.write(`${JSON.stringify({ requestId, envelope })}\n`);
} else if (command === "open" && arg) {
  const raw = fs.readFileSync(0, "utf8").trim();
  const env = JSON.parse(raw);
  const iv = Buffer.from(env.iv, "base64");
  const ct = Buffer.from(env.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`answer:${arg}`));
  decipher.setAuthTag(ct.subarray(-16));

  const plaintext = Buffer.concat([
    decipher.update(ct.subarray(0, -16)),
    decipher.final(),
  ]).toString("utf8");

  const { output, error } = JSON.parse(plaintext);

  if (Array.isArray(output) && output.length > 0) process.stdout.write(`${output.join("\n")}\n`);

  if (error !== null && error !== undefined) {
    process.stderr.write(`${error}\n`);
    process.exit(1);
  }
} else {
  process.stderr.write("Usage: manotes-mcp.mjs seal <script.js> | open <requestId>\n");
  process.exit(1);
}
