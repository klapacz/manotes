import { RecordFormat } from "@manotes/shared/record/format";
import type * as RecordSchema from "@manotes/shared/record.schema";

/** File output and literal edit matching must use the same backlink labels. */
export function buildCache(
  records: ReadonlyArray<Pick<RecordSchema.Record, "id" | "title" | "text">>,
): ReadonlyMap<string, string> {
  return new Map(records.map((record) => [record.id, RecordFormat.label(record)]));
}

export * as BacklinkLabels from "./backlink-labels.ts";
