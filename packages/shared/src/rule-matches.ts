import { Data, Effect, Option, Record, Stream } from "effect";
import { EffectStream } from "./effect/stream";
import { NoteSchema } from "./note.schema";
import { NoteRepo } from "./note.repo";
import { StreamFilter } from "./note/stream-filter";
import { RuleRecord } from "./rule-record.service";

export type MatchStatus = Data.TaggedEnum<{
  Matching: {};
  Unmatched: {};
}>;

export const MatchStatus = Data.taggedEnum<MatchStatus>();

export type Rule = RuleRecord.Rule & { readonly status: MatchStatus };

export function watch(opts: { readonly recordId: NoteSchema.Id }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const records = yield* RuleRecord.Service;
      const notes = yield* NoteRepo.Service;
      const rules = yield* records.reactiveRules();

      return rules.pipe(
        // Target edits replace the lookups and release the previous subscriptions.
        Stream.switchMap((rules) =>
          EffectStream.zipLatestRecord(
            Record.map(rules, (rule) =>
              Stream.unwrap(
                notes.reactiveFindPreviewById({
                  id: opts.recordId,
                  filter: StreamFilter.fromAttrs(rule.rule_targets),
                }),
              ).pipe(
                Stream.map((record) => ({
                  ...rule,
                  status: Option.match(record, {
                    onNone: () => MatchStatus.Unmatched(),
                    onSome: () => MatchStatus.Matching(),
                  }),
                })),
              ),
            ),
          ),
        ),
      );
    }),
  );
}

export * as RuleMatches from "./rule-matches";
