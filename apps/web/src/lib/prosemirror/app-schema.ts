import { createEditor } from "prosekit/core";
import { defineAppSchema } from "../../editor.schema";

export const NOTE_SCHEMA = createEditor({
  extension: defineAppSchema(),
}).schema;
