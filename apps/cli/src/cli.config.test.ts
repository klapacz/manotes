import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Redacted, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { CliConfig } from "./cli.config";
import { CliPaths } from "./cli.paths";

const config: CliConfig.Config = {
  origin: "https://example.com",
  token: "test-token",
  graphId: "test-graph",
  graphKey: Redacted.make(new Uint8Array(32)),
};

describe("CliConfig.write", () => {
  it.each([undefined, "", '[note]\nlanguage = "pl"\n'])(
    "initializes zk without replacing existing config %j",
    async (existing) => {
      const dir = await mkdtemp(path.join(tmpdir(), "manotes-config-"));

      try {
        const manotesDir = path.join(dir, ".manotes");
        const configPath = path.join(manotesDir, "config");
        const zkDir = path.join(dir, ".zk");
        const zkConfigPath = path.join(zkDir, "config.toml");
        await mkdir(manotesDir);

        if (existing !== undefined) {
          await mkdir(zkDir);
          await writeFile(zkConfigPath, existing);
        }

        await Effect.runPromise(
          CliConfig.write().pipe(
            Effect.provide(Layer.succeed(CliConfig.Service, config)),
            Effect.provide(
              Layer.succeed(CliPaths.Service, {
                dir,
                manotesDir,
                configPath,
                databasePath: path.join(manotesDir, "db.sqlite"),
              }),
            ),
            Effect.provide(NodeServices.layer),
          ),
        );

        expect(await readFile(zkConfigPath, "utf8")).toBe(existing ?? "");
        expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
          ...config,
          graphKey: Buffer.from(Redacted.value(config.graphKey)).toString("base64"),
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});

it("decodes existing configuration into a redacted key and preserves its stored encoding", async () => {
  const encoded = {
    origin: "https://example.com",
    token: "test-token",
    graphId: "test-graph",
    graphKey: Buffer.alloc(32, 7).toString("base64"),
  };

  const decoded = await Effect.runPromise(Schema.decodeEffect(CliConfig.Config)(encoded));

  expect(Redacted.isRedacted(decoded.graphKey)).toBe(true);
  expect(Redacted.value(decoded.graphKey)).toEqual(new Uint8Array(32).fill(7));
  expect(JSON.stringify(decoded.graphKey)).not.toContain(encoded.graphKey);
  expect(await Effect.runPromise(Schema.encodeEffect(CliConfig.Config)(decoded))).toEqual(encoded);
});

it.each([true, false])("round trips autoSync=%s", async (autoSync) => {
  const value = { ...config, autoSync };
  const encoded = await Effect.runPromise(Schema.encodeEffect(CliConfig.Config)(value));
  expect(encoded.autoSync).toBe(autoSync);
  const decoded = await Effect.runPromise(Schema.decodeEffect(CliConfig.Config)(encoded));
  expect(decoded.autoSync).toBe(autoSync);
});

it.each(["true", 1, null])("rejects invalid autoSync=%j", async (autoSync) => {
  const encoded = await Effect.runPromise(Schema.encodeEffect(CliConfig.Config)(config));
  await expect(
    Effect.runPromise(Schema.decodeUnknownEffect(CliConfig.Config)({ ...encoded, autoSync })),
  ).rejects.toThrow();
});
