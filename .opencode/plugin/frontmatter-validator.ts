import { type Plugin } from "@opencode-ai/plugin";
import { validateFrontmatter } from "../lib/validate";
import { validationConfigs } from "../lib/validation-config";

export const FrontmatterValidatorPlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "Edit" && input.tool !== "Write") return;

      const metadata = output.metadata as { filePath?: string } | undefined;
      const file = metadata?.filePath;
      if (!file) return;

      const config = validationConfigs.find(
        (c) =>
          file.startsWith(c.plugin.prefix) && file.endsWith(c.plugin.suffix),
      );
      if (!config) return;

      const content = await Bun.file(file)
        .text()
        .catch(() => null);
      if (!content) return;

      const result = await validateFrontmatter(content, config.schema);
      if (!result.success) {
        const errors = result.errors.map((e) => `  - ${e}`).join("\n");

        await ctx.client.tui.showToast({
          body: {
            title: `${config.label} Validation Failed`,
            message: `${file}:\n${errors}`,
            variant: "error",
          },
        });

        output.output = `VALIDATION FAILED for ${file}:\n${errors}\n\nFix the frontmatter before proceeding.`;
        output.title = `${config.label} validation failed`;
      }
    },
  };
};
