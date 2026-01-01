#!/usr/bin/env bun
import { Glob } from "bun";
import { validateFrontmatter } from "../lib/validate";
import { validationConfigs } from "../lib/validation-config";

let hasErrors = false;

for (const config of validationConfigs) {
  const glob = new Glob(config.script.glob);
  const files = await Array.fromAsync(glob.scan("."));

  for (const file of files) {
    const content = await Bun.file(file).text();
    const result = await validateFrontmatter(content, config.schema);

    if (!result.success) {
      hasErrors = true;
      console.error(`\n${file} (${config.label}):`);
      result.errors.forEach((e) => console.error(`  - ${e}`));
    }
  }
}

if (hasErrors) {
  console.error("\nValidation failed.");
  process.exit(1);
} else {
  console.log("All devlogs and tasks valid.");
}
