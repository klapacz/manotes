import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { CliConfig } from "./cli.config";
import { CliPaths } from "./cli.paths";

const config: CliConfig.Config = {
  origin: "https://example.com",
  token: "test-token",
  graphId: "test-graph",
  graphKey: new Uint8Array(32),
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
          graphKey: Buffer.from(config.graphKey).toString("base64"),
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
