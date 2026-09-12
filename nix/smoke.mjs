import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const executable = path.resolve(process.argv[2]);
const directory = mkdtempSync(path.join(tmpdir(), "manotes-package-"));

try {
  const run = (args, input) => {
    const result = spawnSync(executable, args, {
      cwd: directory,
      // Neither Node nor any checkout-provided command can be found through PATH.
      env: { HOME: directory, TMPDIR: directory, PATH: "/nonexistent" },
      encoding: "utf8",
      input,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };

  assert.match(run(["--help"]), /manotes/);
  mkdirSync(path.join(directory, ".manotes"));
  writeFileSync(
    path.join(directory, ".manotes/config"),
    JSON.stringify({
      origin: "http://127.0.0.1:1",
      token: "unused-offline-token",
      graphId: "nix-smoke",
      graphKey: Buffer.alloc(32).toString("base64"),
    }),
  );

  assert.match(run(["status"]), /Pending publication: 0 changes/);
  run(
    ["execute"],
    'export default async (api) => { await api.createNote("smoke", [{ kind: "append", markdown: "# Packaged CLI\\n\\nCreated outside the checkout." }]); };',
  );
  assert.match(
    readFileSync(path.join(directory, "smoke.md"), "utf8"),
    /Created outside the checkout/,
  );

  writeFileSync(
    path.join(directory, "edit.ts"),
    'export default async (api: { editNote: Function }) => { await api.editNote("smoke", [{ kind: "replace", text: "Created outside the checkout.", with: "Updated by the installed CLI." }]); };',
  );
  run(["execute", path.join(directory, "edit.ts")]);
  assert.match(
    readFileSync(path.join(directory, "smoke.md"), "utf8"),
    /Updated by the installed CLI/,
  );
  assert.match(run(["status"]), /Pending publication: [1-9]\d* changes/);
  console.log(
    "Installed CLI passed help, SQLite migrations, stdin creation, and TypeScript editing.",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
