import { RecordFormat } from "@manotes/shared/record/format";
import { Effect, Stream } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { QueryEngine } from "../../lib/query-engine";

export type Result = { value: RecordSchema.Id; label: string };

export const query = searchQuery([]);

export function scoped(opts: { readonly filter: AttrsSchema.Filter }) {
  return searchQuery(opts.filter);
}

function searchQuery(filter: AttrsSchema.Filter) {
  const search = Effect.fn("ComponentsRecordRecordQuery.search")(function* (
    request: QueryEngine.Request,
  ) {
    const repo = yield* RecordRepo.Service;

    return yield* repo.reactiveSearchPreview([
      AttrsSchema.makeFilterExpr.cmp({ val: ["body", "contains", request.text.trim()] }),
      ...filter,
    ]);
  });

  return QueryEngine.share((request) => {
    return Stream.unwrap(search(request)).pipe(
      Stream.map((records) => {
        return records.map((record) => ({
          value: { value: record.id, label: RecordFormat.queryLabel(record, request.text) },
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
