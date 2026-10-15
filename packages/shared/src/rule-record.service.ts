import { Array, Context, Effect, Layer, Option, Record, Result, Stream } from "effect";
import { NoteSchema } from "./note.schema";
import { RuleExpect } from "./rule-expect";
import { RuleExpectRepo } from "./rule-expect.repo";
import { RuleRecordRepo } from "./rule-record.repo";

export type Rule = RuleRecordRepo.Rule & {
  readonly expects: ReturnType<typeof RuleExpect.reduceExpects>;
};

export class Service extends Context.Service<Service>()("RuleRecord.Service", {
  make: Effect.gen(function* () {
    const records = yield* RuleRecordRepo.Service;
    const expectations = yield* RuleExpectRepo.Service;

    const reactiveRules = Effect.fn("RuleRecord.reactiveRules")(function* () {
      const rules = yield* records.reactiveRules();
      const expects = yield* expectations.reactiveAll();

      return Stream.zipLatestWith(rules, expects, (rules, expects) => {
        const byRule = Array.groupBy(expects, (expect) => expect.ruleId);

        // Index repository rows once; the rest of the pipeline keeps rule IDs as keys.
        return Record.fromEntries(
          Array.map(rules, (rule) => {
            return [
              rule.id,
              { ...rule, expects: expectsForRule({ ruleId: rule.id, byRule }) },
            ] as const;
          }),
        );
      });
    });

    return { reactiveRules };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([RuleRecordRepo.Service.layer, RuleExpectRepo.Service.layer]),
  );
}

function expectsForRule(opts: {
  readonly ruleId: NoteSchema.Id;
  readonly byRule: Readonly<Record<NoteSchema.Id, readonly RuleExpectRepo.RuleExpectRow[]>>;
}) {
  const rows = Record.get(opts.byRule, opts.ruleId).pipe(Option.getOrElse(() => []));

  return RuleExpect.reduceExpects(
    Array.filterMap(rows, (row) => {
      return Option.fromNullishOr(row.value).pipe(
        Option.map((expectation): RuleExpect.Expect => ({
          propId: row.propId,
          ruleId: row.ruleId,
          expectation,
        })),
        Result.fromOption(() => undefined),
      );
    }),
  );
}

export * as RuleRecord from "./rule-record.service";
