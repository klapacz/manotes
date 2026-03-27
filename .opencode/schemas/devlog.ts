import { z } from "zod";

const BaseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z.iso.date("Date must be in YYYY-MM-DD format"),
  tags: z.array(z.string()).min(1, "At least one tag is required"),
});

const ShippedSchema = BaseSchema.extend({
  type: z.literal("shipped"),
});

const SnippetSchema = BaseSchema.extend({
  type: z.literal("snippet"),
  status: z.enum(["working", "experimental", "broken", "deprecated"]),
  diff_file: z.string().min(1, "Diff file path is required for snippets"),
});

export const DevlogSchema = z.discriminatedUnion("type", [ShippedSchema, SnippetSchema]);

export type Devlog = z.infer<typeof DevlogSchema>;
