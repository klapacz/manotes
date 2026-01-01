import type { StandardSchemaV1 } from "@standard-schema/spec";
import { DevlogSchema } from "../schemas/devlog";
import { TaskSchema } from "../schemas/task";

export interface ValidationConfig {
  schema: StandardSchemaV1;
  label: string;
  plugin: {
    prefix: string;
    suffix: string;
  };
  script: {
    glob: string;
  };
}

export const validationConfigs: ValidationConfig[] = [
  {
    schema: DevlogSchema,
    label: "Devlog",
    plugin: { prefix: "docs/devlog/", suffix: ".md" },
    script: { glob: "docs/devlog/*.md" },
  },
  {
    schema: TaskSchema,
    label: "Task",
    plugin: { prefix: "docs/tasks/", suffix: ".md" },
    script: { glob: "docs/tasks/*.md" },
  },
];
