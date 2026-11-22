import { Query } from "effect-qb";
import { Array, Context, Effect, Layer, Option, Order, Schema, Stream, Struct, pipe } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RecordSchema } from "./record.schema";

export const ValidDef = Schema.Struct({
  id: RecordSchema.Id,
  title: Schema.NullOr(Schema.String),
  preset_filter: Schema.NullOr(AttrsSchema.Filter).pipe(Schema.decodeTo(AttrsSchema.Filter)),
  preset_default: Schema.Boolean,
});

export type Def = typeof ValidDef.Type;

export function findDefault(defs: readonly Def[]): Option.Option<Def> {
  return pipe(
    defs,
    Array.filter((def) => def.preset_default),
    Array.sort(Order.mapInput(Order.String, (def: Def) => def.id)),
    Array.head,
  );
}

const decodeDefs = Schema.decodeEffect(Schema.Array(ValidDef));

export class Service extends Context.Service<Service>()("PresetRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const defPlan = defSelect.pipe(
      Query.from(Tables.records),
      Query.where(
        Query.and(Query.eq(Tables.records._tag, "preset"), Query.eq(Tables.records.attrs_valid, 1)),
      ),
      Query.orderBy(Tables.records.title, "asc"),
      Query.orderBy(Tables.records.id, "asc"),
    );

    const listDefs = Effect.fn("PresetRecordRepo.listDefs")(function* () {
      return yield* db.query(defPlan).pipe(Effect.flatMap(decodeDefs));
    });

    const reactiveDefs = Effect.fn("PresetRecordRepo.reactiveDefs")(function* () {
      const stream = yield* db.reactiveQuery(defPlan);

      return stream.pipe(Stream.mapEffect((rows) => decodeDefs(rows)));
    });

    return { listDefs, reactiveDefs };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

const defFields = ["id", "title", "preset_filter", "preset_default"] as const;

// Preserve named JSON column types in emitted declarations.
const defColumns: Pick<typeof Tables.records, (typeof defFields)[number]> = Struct.pick(
  Tables.records,
  defFields,
);

const defSelect: ReturnType<typeof Query.select<typeof defColumns>> = Query.select(defColumns);

export type Row = Query.ResultRow<typeof defSelect>;

export * as PresetRecordRepo from "./preset-record.repo";
