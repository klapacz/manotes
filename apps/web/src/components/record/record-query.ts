import { Effect, Stream } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";
import type { StreamSettings } from "@manotes/shared/record/stream-settings";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { QueryEngine } from "../../lib/query-engine";

export type Result = { value: RecordSchema.Id; label: string };

export function label(record: { title: string | null; text: string }, query = ""): string {
  const text = query.trim().toLowerCase();

  if (record.title && (!text || record.title.toLowerCase().includes(text))) return record.title;

  return (
    record.text
      .split("\n")
      .find((line) => line.toLowerCase().includes(text) && line.trim())
      ?.trim() ||
    record.title ||
    "Untitled record"
  );
}

export const query = searchQuery(undefined);

export function scoped(opts: { readonly filter: StreamSettings.Filter }) {
  return searchQuery(opts.filter);
}

function searchQuery(filter: StreamSettings.Filter | undefined) {
  const search = Effect.fn("ComponentsRecordRecordQuery.search")(function* (
    request: QueryEngine.Request,
  ) {
    const repo = yield* RecordRepo.Service;

    return yield* repo.reactiveSearchPreview({ search: request.text, filter });
  });

  return QueryEngine.share((request) => {
    return Stream.unwrap(search(request)).pipe(
      Stream.map((records) => {
        return records.map((record) => ({
          value: { value: record.id, label: label(record, request.text) },
          // Body-only hits rank below menu actions and matching page titles.
          score: !request.text.trim()
            ? 1
            : record.title?.toLowerCase().includes(request.text.trim().toLowerCase())
              ? QueryEngine.score({ text: request.text, label: record.title })
              : 0.1,
        }));
      }),
    );
  });
}

export * as RecordQuery from "./record-query";
