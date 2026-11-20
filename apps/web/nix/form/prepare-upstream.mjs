import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

// Build-only manifest/config changes. Upstream runtime sources remain unchanged.
writeFileSync(
  "package.json",
  JSON.stringify({
    private: true,
    packageManager: "pnpm@10.33.0",
    devDependencies: { tsdown: "0.22.14", typescript: "6.0.2" },
  }),
);

writeFileSync(
  "pnpm-workspace.yaml",
  'packages:\n  - "packages/form-core"\n  - "packages/solid-form"\n',
);

for (const name of ["form-core", "solid-form"]) {
  const path = join("packages", name);
  const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  delete manifest.devDependencies;
  delete manifest.scripts;
  manifest.dependencies["@tanstack/store"] = "0.11.1";

  if (name === "form-core") manifest.dependencies["@tanstack/pacer-lite"] = "0.2.2";
  else manifest.devDependencies = { "solid-js": "2.0.3", "@solidjs/web": "2.0.3" };
  writeFileSync(join(path, "package.json"), JSON.stringify(manifest, null, 2));
  copyFileSync("LICENSE", join(path, "LICENSE"));
  writeFileSync(
    join(path, "build.config.mjs"),
    `export default { entry: ${JSON.stringify(name === "form-core" ? ["src/index.ts", "src/internals.ts"] : ["src/index.ts"])}, format: ["esm"], unbundle: true, dts: true, sourcemap: false, clean: true, minify: false, fixedExtension: false };\n`,
  );
}
