import { Column, Table, Type } from "effect-qb";
import { Schema } from "effect";

export {
  notes,
  props,
  ruleExpects,
  events,
  backlinks,
  materializationCheckpoint,
  type Note,
  type Prop,
  type RuleExpect,
  type Event,
  type Backlink,
  type MaterializationCheckpoint,
} from "@manotes/shared/db.tables";

export const recordings = Table.make("recordings", {
  path: Column.text().pipe(Column.primaryKey),
  recordedAt: Column.text(),
  mimeType: Column.text(),
  durationMs: Column.int().pipe(Column.nullable),
  state: Column.custom(Schema.Literals(["pending", "completed", "error"]), Type.text()),
  noteId: Column.text(),
  intent: Column.text(),
});

export type Recording = Table.SelectOf<typeof recordings>;

export * as Tables from "./db.tables";
