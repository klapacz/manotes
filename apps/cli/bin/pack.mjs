import { execFileSync } from "node:child_process";
import { cp, glob, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const app = fileURLToPath(new URL("..", import.meta.url));

const directory = path.join(app, "dist/npm");

const manifest = JSON.parse(await readFile(path.join(app, "package.json"), "utf8"));

await rm(directory, { recursive: true, force: true });

await mkdir(directory, { recursive: true });

await build({
  absWorkingDir: app,
  entryPoints: ["src/cli.ts"],
  outfile: path.join(directory, "dist/cli.mjs"),
  bundle: true,
  minify: true,
  platform: "node",
  target: "node22.19",
  format: "esm",
  // Keep the sandbox's worker and WASM files in their installed npm packages.
  external: ["@earendil-works/pi-codemode", "ws"],
  alias: {
    "@manotes/shared": path.resolve(app, "../../packages/shared/src"),
    "@manotes/effect-db-sqlite": path.resolve(app, "../../packages/effect-db-sqlite/src"),
    "@manotes/effect-qb-sqlite": path.resolve(app, "../../packages/effect-qb-sqlite/src"),
  },
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as manotesRequire } from "node:module";\nconst require = manotesRequire(import.meta.url);',
  },
});

const migrations = path.join(app, "migrations");

for await (const file of glob("*/migration.sql", { cwd: migrations })) {
  const destination = path.join(directory, "migrations", file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(migrations, file), destination);
}

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
      dependencies: {
        "@earendil-works/pi-codemode": manifest.dependencies["@earendil-works/pi-codemode"],
        ws: manifest.dependencies.ws,
      },
    },
    null,
    2,
  ),
);

const [{ filename, size }] = JSON.parse(
  execFileSync("npm", ["pack", "--json"], { cwd: directory, encoding: "utf8" }),
);

const tarball = path.join(app, "dist/manotes-cli.tgz");

await rename(path.join(directory, filename), tarball);

console.log(`${tarball} (${size} bytes)`);
