import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const app = fileURLToPath(new URL("..", import.meta.url));

const directory = path.join(app, "dist/cli");

const manifest = JSON.parse(await readFile(path.join(app, "package.json"), "utf8"));

await rm(directory, { recursive: true, force: true });

await mkdir(directory, { recursive: true });

await build({
  absWorkingDir: app,
  entryPoints: ["src/cli.ts"],
  outfile: path.join(directory, "dist/cli.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["tsx", "ws"],
  alias: {
    "@manotes/shared": path.resolve(app, "../../packages/shared/src"),
  },
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as manotesRequire } from "node:module";\nconst require = manotesRequire(import.meta.url);',
  },
});

await cp(path.join(app, "drizzle"), path.join(directory, "drizzle"), { recursive: true });

await cp(path.resolve(app, "../../LICENSE"), path.join(directory, "LICENSE"));

await writeFile(
  path.join(directory, "package.json"),
  JSON.stringify(
    {
      name: "manotes-cli",
      version: manifest.version,
      private: true,
      type: "module",
      license: "MIT",
      bin: { manotes: "dist/cli.mjs" },
      engines: manifest.engines,
      dependencies: { tsx: manifest.dependencies.tsx, ws: manifest.dependencies.ws },
    },
    null,
    2,
  ),
);

const [{ filename }] = JSON.parse(
  execFileSync("npm", ["pack", "--json"], { cwd: directory, encoding: "utf8" }),
);

const tarball = path.join(app, "dist/manotes-cli.tgz");

await rename(path.join(directory, filename), tarball);

console.log(tarball);
