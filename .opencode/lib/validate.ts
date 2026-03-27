import type { StandardSchemaV1 } from "@standard-schema/spec";
import { extractFrontmatter } from "./frontmatter";

export type ValidationResult<T> = { success: true; data: T } | { success: false; errors: string[] };

/**
 * Validates frontmatter against a Standard Schema.
 * Extracts YAML frontmatter from content and validates it.
 */
export async function validateFrontmatter<T>(
  content: string,
  schema: StandardSchemaV1<unknown, T>,
): Promise<ValidationResult<T>> {
  const frontmatter = extractFrontmatter(content);

  if (!frontmatter) {
    return { success: false, errors: ["Missing YAML frontmatter"] };
  }

  const result = await schema["~standard"].validate(frontmatter);

  if (result.issues) {
    const errors = result.issues.map((issue) => {
      const path = issue.path?.map((p) => (typeof p === "object" ? p.key : p)).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return { success: false, errors };
  }

  return { success: true, data: result.value };
}
