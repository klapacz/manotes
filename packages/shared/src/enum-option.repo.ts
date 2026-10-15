import { Query } from "effect-qb";
import { RecordFilter } from "./record/filter";
import { Context, Effect, Layer } from "effect";
import { BuiltinAttrs } from "./builtin-attrs";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RecordSchema } from "./record.schema";

export class Service extends Context.Service<Service>()("EnumOptionRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveOptions = Effect.fn("EnumOptionRepo.reactiveOptions")(function* (opts: {
      readonly enum_parent: RecordSchema.Id;
    }) {
      const stream = yield* db.reactiveQuery(
        optionSelect.pipe(
          Query.from(Tables.records),
          Query.where(
            Query.and(
              Query.eq(Tables.records._tag, "owned"),
              Query.eq(Tables.records.owned_type, "enum_option"),
              Query.eq(Tables.records.owned_parent, opts.enum_parent),
              RecordFilter.propertyPredicate(
                BuiltinAttrs.archivedId,
                BuiltinAttrs.archived.prop_default,
              ),
            ),
          ),
          Query.orderBy(Tables.records.title),
          Query.orderBy(Tables.records.id),
        ),
      );

      return stream;
    });

    return { reactiveOptions };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

const optionSelect = Query.select({
  id: Tables.records.id,
  title: Tables.records.title,
  text: Tables.records.text,
});

export type Item = Query.ResultRow<typeof optionSelect>;

export * as EnumOptionRepo from "./enum-option.repo";
