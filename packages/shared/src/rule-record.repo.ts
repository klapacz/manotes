import { and, asc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

export const Rule = Schema.Struct({
  id: NoteSchema.Id,
  title: NoteSchema.Record.fields.title,
  rule_storage: Schema.NullOr(Schema.fromJsonString(AttrsSchema.RuleStorage)).pipe(
    Schema.decodeTo(AttrsSchema.RuleStorage),
  ),
  rule_targets: Schema.NullOr(Schema.fromJsonString(AttrsSchema.TargetFilter)).pipe(
    Schema.decodeTo(AttrsSchema.TargetFilter),
  ),
});

export type Rule = typeof Rule.Type;

const decodeRules = Schema.decodeEffect(Schema.Array(Rule));

export class Service extends Context.Service<Service>()("RuleRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveRules = Effect.fn("RuleRecordRepo.reactiveRules")(function* () {
      const rules = yield* db.reactiveQuery((db) => {
        return db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            rule_storage: Tables.notes.rule_storage,
            rule_targets: Tables.notes.rule_targets,
          })
          .from(Tables.notes)
          .where(and(eq(Tables.notes._tag, "rule"), eq(Tables.notes.attrs_valid, 1)))
          .orderBy(asc(Tables.notes.title), asc(Tables.notes.id));
      });

      return rules.pipe(Stream.mapEffect((rows) => decodeRules(rows)));
    });

    return { reactiveRules };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as RuleRecordRepo from "./rule-record.repo";
