import { z } from "zod";

export const TaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  id: z.string().regex(/^[A-Z]{4}$/, "ID must be 4 uppercase letters (e.g., ABCD)"),
  status: z.enum(["planned", "in_progress", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]),
  depends_on: z.array(z.string()).default([]),
});

export type Task = z.infer<typeof TaskSchema>;
