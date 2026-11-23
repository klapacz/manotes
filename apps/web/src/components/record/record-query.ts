import { RecordFormat } from "@manotes/shared/record/format";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Array, Effect, Option, Order, Predicate, Stream, pipe } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { QueryEngine } from "../../lib/query-engine";

export type Result = {
  value: RecordSchema.Id;
  label: string;
  badge?: string;
};

const NON_NOTE_PENALTY = 0.05;

const byScoreDesc: Order.Order<QueryEngine.Match<Result>> = Order.flip(
  Order.mapInput(Order.Number, (match) => match.score),
);

export const query = searchQuery([]);

export function scoped(opts: { readonly filter: AttrsSchema.Filter }) {
  return searchQuery(opts.filter);
}

function searchQuery(filter: AttrsSchema.Filter) {
  // Suppress kind labels when the picker's filter already pins `_tag` to a single kind
  // (e.g. Rule violations or Enum options), where repeating the same label on every row is noise.
  const showKind = Option.isNone(StreamSettings.firstTag(filter));

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
        return pipe(
          records,
          Array.map((record) => ({
            value: {
              value: record.id,
              label: RecordFormat.queryLabel(record, request.text),
              badge: showKind ? RecordFormat.kindLabel(record._tag) : undefined,
            },
            score: scoreRecord(record, request.text),
          })),
          Array.sort(byScoreDesc),
        );
      }),
    );
  });
}

function scoreRecord(record: RecordRepo.Preview, text: string): number {
  const penalty = Predicate.isTagged(record, "note") ? 0 : NON_NOTE_PENALTY;
  const trimmed = text.trim();

  if (!trimmed) return 1 - penalty;

  if (record.title?.toLowerCase().includes(trimmed.toLowerCase())) {
    return QueryEngine.score({ text, label: record.title }) - penalty;
  }

  // Body-only hits rank below menu actions and matching page titles.
  return 0.1 - penalty;
}

export * as RecordQuery from "./record-query";
