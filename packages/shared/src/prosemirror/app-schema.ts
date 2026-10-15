import { createEditor } from "prosekit/core";
import { defineAppSchema } from "../editor.schema";

export const RECORD_SCHEMA = createEditor({
  extension: defineAppSchema(),
}).schema;
