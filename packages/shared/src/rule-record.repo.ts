import { Query } from "effect-qb";
import { Context, Effect, Layer, Schema, Stream } from "effect";
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
        Query.select({
          id: Tables.records.id,
          title: Tables.records.title,
          rule_storage: Tables.records.rule_storage,
          rule_targets: Tables.records.rule_targets,
        }).pipe(
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

export * as RuleRecordRepo from "./rule-record.repo";
