import { AttrsSchema } from "./attrs.schema";
import { Data, Effect, Option, Record, Stream } from "effect";
import { EffectStream } from "./effect/stream";
import { RecordSchema } from "./record.schema";
import { RecordRepo } from "./record.repo";
import { RuleRecord } from "./rule-record.service";

export type MatchStatus = Data.TaggedEnum<{
  Matching: {};
  Unmatched: {};
}>;

export const MatchStatus = Data.taggedEnum<MatchStatus>();

export type Rule = RuleRecord.Rule & { readonly status: MatchStatus };

export function watch(opts: { readonly recordId: RecordSchema.Id }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const ruleRecords = yield* RuleRecord.Service;
      const records = yield* RecordRepo.Service;
      const rules = yield* ruleRecords.reactiveRules();

      return rules.pipe(
        // Target edits replace the lookups and release the previous subscriptions.
        Stream.switchMap((rules) => {
          return EffectStream.zipLatestRecord(
            Record.map(rules, (rule) => {
              return Stream.unwrap(
                records.reactiveFindPreview([
                  AttrsSchema.makeFilterExpr.cmp({ val: ["id", "=", opts.recordId] }),
                  ...rule.rule_targets,
                ]),
              ).pipe(
                Stream.map((record) => ({
                  ...rule,
                  status: Option.match(record, {
                    onNone: () => MatchStatus.Unmatched(),
                    onSome: () => MatchStatus.Matching(),
                  }),
                })),
              );
            }),
          );
        }),
      );
    }),
  );
}

export * as RuleMatches from "./rule-matches";
