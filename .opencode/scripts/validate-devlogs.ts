#!/usr/bin/env bun
import { Glob } from "bun";
import { validateFrontmatter } from "../lib/validate";
import { DevlogSchema } from "../schemas/devlog";

const glob = new Glob("docs/devlog/*.md");
const files = await Array.fromAsync(glob.scan("."));
let hasErrors = false;

for (const file of files) {
  const content = await Bun.file(file).text();
  const result = await validateFrontmatter(content, DevlogSchema);

  if (!result.success) {
    hasErrors = true;
    console.error(`\n${file}:`);
    result.errors.forEach((e) => console.error(`  - ${e}`));
  }
}

if (hasErrors) {
  console.error("\nValidation failed.");
  process.exit(1);
} else {
  console.log("All devlogs valid.");
}
