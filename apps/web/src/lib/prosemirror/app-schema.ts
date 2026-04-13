import { createEditor } from "prosekit/core";
import { defineAppSchema } from "../../editor.schema";

export const DAILY_NOTE_SCHEMA = createEditor({
  extension: defineAppSchema({ isDaily: true }),
}).schema;

export const NON_DAILY_NOTE_SCHEMA = createEditor({
  extension: defineAppSchema({ isDaily: false }),
}).schema;

export function getAppSchema(isDaily: boolean) {
  return isDaily ? DAILY_NOTE_SCHEMA : NON_DAILY_NOTE_SCHEMA;
}
