import { Query } from "effect-qb";
import { Context, Effect, Layer, Schema, Stream, Struct } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RecordSchema } from "./record.schema";
import { RecordFilter } from "./record/filter";
import { Filters } from "./record/filters";
import type { RuleExpect } from "./rule-expect";

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

const decodeRule = Schema.decodeEffect(Rule);

export type RuleWithExpectations = Rule & { readonly expectations: readonly RuleExpect.Expect[] };

export class Service extends Context.Service<Service>()("RuleRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const listPlan = Query.select({
      ...ruleColumns,
      expectations: Query.select({
        ruleId: Tables.ruleExpects.ruleId,
        propId: Tables.ruleExpects.propId,
        expectation: Tables.ruleExpects.value,
      }).pipe(
        Query.from(Tables.ruleExpects),
        Query.where(
          Query.and(
            Query.eq(Tables.ruleExpects.ruleId, Tables.records.id),
            Query.isNotNull(Tables.ruleExpects.value),
          ),
        ),
        Query.orderBy(Tables.ruleExpects.propId),
        db.jsonArrayFrom,
      ),
    }).pipe(
      Query.from(Tables.records),
      Query.where(
        RecordFilter.filterPredicate([
          AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "rule"] }),
          Filters.aliases.unarchived.make(),
        ]),
      ),
      Query.where(Query.eq(Tables.records.attrs_valid, 1)),
      Query.orderBy(Tables.records.title),
      Query.orderBy(Tables.records.id),
    );

    const decodeList = Effect.forEach(
      ({ expectations, ...row }: Query.ResultRow<typeof listPlan>) => {
        return decodeRule(row).pipe(
          Effect.map((rule): RuleWithExpectations => ({ ...rule, expectations })),
        );
      },
    );

    const list = Effect.fn("RuleRecordRepo.list")(function* () {
      return yield* db.query(listPlan).pipe(Effect.flatMap(decodeList));
    });

    const reactiveList = Effect.fn("RuleRecordRepo.reactiveList")(function* () {
      const rows = yield* db.reactiveQuery(listPlan);

      return rows.pipe(Stream.mapEffect(decodeList));
    });

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

    return { list, reactiveList, reactiveRules };
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
