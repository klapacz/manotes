import matter from "gray-matter";
import yaml from "js-yaml";

/**
 * Extracts and parses YAML frontmatter from markdown content.
 */
export function extractFrontmatter(
  content: string,
): Record<string, unknown> | null {
  // Use JSON_SCHEMA to prevent js-yaml from auto-converting date strings
  // like "2025-12-31" into JavaScript Date objects
  const result = matter(content, {
    engines: {
      yaml: (s) =>
        yaml.load(s, { schema: yaml.JSON_SCHEMA }) as never as object,
    },
  });
  if (!result.data || Object.keys(result.data).length === 0) {
    return null;
  }
  return result.data;
}
