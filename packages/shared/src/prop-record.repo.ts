import { Query } from "effect-qb";
import { Context, Effect, Layer, Schema, Stream, Record, Struct } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

export const Defs = Struct.evolve(AttrsSchema.PropVal.cases, {
  text: (schema) => defSchema(schema),
  number: (schema) => defSchema(schema),
  bool: (schema) => defSchema(schema),
  enum: (schema) => defSchema(schema),
  link: (schema) => {
    return defSchema(schema).mapFields((fields) => ({
      ...fields,
      prop_targets: Schema.NullOr(AttrsSchema.TargetFilter),
    }));
  },
});

function defSchema<const Tag extends AttrsSchema.PropValTag, const Value extends Schema.Constraint>(
  value: Schema.TaggedStruct<Tag, { readonly val: Value }>,
) {
  return Schema.Struct({
    id: NoteSchema.Id,
    title: Schema.NullOr(Schema.String),
    prop_type: Schema.NullOr(AttrsSchema.PropValTag).pipe(Schema.decodeTo(value.fields._tag)),
    prop_default: Schema.NullOr(value),
  });
}

export const ValidDef = Schema.Union(Record.values(Defs));

type DefByTag = {
  [K in AttrsSchema.PropValTag]: (typeof Defs)[K]["Type"];
};

export type Def<Tag extends AttrsSchema.PropValTag = AttrsSchema.PropValTag> = {
  [K in Tag]: DefByTag[K] & { readonly prop_type: K };
}[Tag];

const decodeDefs = Schema.decodeUnknownEffect(Schema.Array(ValidDef));

export class Service extends Context.Service<Service>()("PropRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveDefs = Effect.fn("PropRecordRepo.reactiveDefs")(function* () {
      const stream = yield* db.reactiveQuery(
        Query.select({
          id: Tables.notes.id,
          title: Tables.notes.title,
          prop_type: Tables.notes.prop_type,
          prop_default: Tables.notes.prop_default,
          prop_targets: Tables.notes.prop_targets,
        }).pipe(
          Query.from(Tables.notes),
          Query.where(
            Query.and(Query.eq(Tables.notes._tag, "prop"), Query.eq(Tables.notes.attrs_valid, 1)),
          ),
          Query.orderBy(Tables.notes.title, "asc"),
          Query.orderBy(Tables.notes.id, "asc"),
        ),
      );

      return stream.pipe(Stream.mapEffect((rows) => decodeDefs(rows)));
    });

    return { reactiveDefs };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as PropRecordRepo from "./prop-record.repo";
