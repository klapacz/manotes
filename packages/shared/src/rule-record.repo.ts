import { Query } from "effect-qb";
import { Context, Effect, Layer, Schema, Stream, Struct } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RecordSchema } from "./record.schema";

export const Rule = Schema.Struct({
  id: RecordSchema.Id,
  title: Schema.NullOr(Schema.String),
  rule_storage: Schema.NullOr(AttrsSchema.RuleStorage).pipe(
    Schema.decodeTo(AttrsSchema.RuleStorage),
  ),
  rule_targets: Schema.NullOr(AttrsSchema.TargetFilter).pipe(
    Schema.decodeTo(AttrsSchema.TargetFilter),
  ),
});

export type Rule = typeof Rule.Type;

const decodeRules = Schema.decodeEffect(Schema.Array(Rule));

export class Service extends Context.Service<Service>()("RuleRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveRules = Effect.fn("RuleRecordRepo.reactiveRules")(function* () {
      const rules = yield* db.reactiveQuery(
        ruleSelect.pipe(
          Query.from(Tables.records),
          Query.where(
            Query.and(
              Query.eq(Tables.records._tag, "rule"),
              Query.eq(Tables.records.attrs_valid, 1),
            ),
          ),
          Query.orderBy(Tables.records.title),
          Query.orderBy(Tables.records.id),
        ),
      );

      return rules.pipe(Stream.mapEffect((rows) => decodeRules(rows)));
    });

    return { reactiveRules };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

const ruleFields = ["id", "title", "rule_storage", "rule_targets"] as const;

// Preserve named JSON column types in emitted declarations.
const ruleColumns: Pick<typeof Tables.records, (typeof ruleFields)[number]> = Struct.pick(
  Tables.records,
  ruleFields,
);

const ruleSelect: ReturnType<typeof Query.select<typeof ruleColumns>> = Query.select(ruleColumns);

export type Row = Query.ResultRow<typeof ruleSelect>;

export * as RuleRecordRepo from "./rule-record.repo";
