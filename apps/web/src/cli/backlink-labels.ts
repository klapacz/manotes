import { NoteFormat } from "../lib/note/format.ts";
import type * as NoteSchema from "../lib/note.schema.ts";

/** File output and literal edit matching must use the same backlink labels. */
export function buildCache(
  records: ReadonlyArray<Pick<NoteSchema.Record, "id" | "title" | "text">>,
): ReadonlyMap<string, string> {
  return new Map(records.map((record) => [record.id, NoteFormat.label(record)]));
}

export * as BacklinkLabels from "./backlink-labels.ts";
