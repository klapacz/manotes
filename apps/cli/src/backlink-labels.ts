import { NoteFormat } from "@manotes/shared/note/format";
import type * as NoteSchema from "@manotes/shared/note.schema";

/** File output and literal edit matching must use the same backlink labels. */
export function buildCache(
  records: ReadonlyArray<Pick<NoteSchema.Record, "id" | "title" | "text">>,
): ReadonlyMap<string, string> {
  return new Map(records.map((record) => [record.id, NoteFormat.label(record)]));
}

export * as BacklinkLabels from "./backlink-labels.ts";
