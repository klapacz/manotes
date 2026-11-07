import { RecordSchema } from "./record.schema";
import type { RecordRepo } from "./record.repo";
import { RecordFormat } from "./record/format";

/** File output and literal edit matching must use the same backlink labels. */
export function buildCache(
  records: ReadonlyArray<Pick<RecordRepo.Record, "id" | "title" | "text">>,
): ReadonlyMap<RecordSchema.Id, string> {
  return new Map(records.map((record) => [record.id, RecordFormat.label(record)]));
}

export * as BacklinkLabels from "./backlink-labels.ts";
