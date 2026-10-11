import { and, asc, eq } from "drizzle-orm";
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
  link: (schema) =>
    defSchema(schema).mapFields((fields) => ({
      ...fields,
      prop_targets: Schema.NullOr(Schema.fromJsonString(AttrsSchema.TargetFilter)),
    })),
});

function defSchema<const Tag extends AttrsSchema.PropValTag, const Value extends Schema.Constraint>(
  value: Schema.TaggedStruct<Tag, { readonly val: Value }>,
) {
  return Schema.Struct({
    id: NoteSchema.Id,
    title: NoteSchema.Record.fields.title,
    builtin: Schema.BooleanFromBit,
    prop_type: Schema.NullOr(AttrsSchema.PropValTag).pipe(Schema.decodeTo(value.fields._tag)),
    prop_default: Schema.NullOr(Schema.fromJsonString(value)),
  });
}

export const ValidDef = Schema.Union(Record.values(Defs));

type DefByTag = {
  [K in AttrsSchema.PropValTag]: (typeof Defs)[K]["Type"];
};

export type Def<Tag extends AttrsSchema.PropValTag = AttrsSchema.PropValTag> = {
  [K in Tag]: DefByTag[K] & { readonly prop_type: K };
}[Tag];

const decodeDefs = Schema.decodeEffect(Schema.Array(ValidDef));

export class Service extends Context.Service<Service>()("PropRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveDefs = Effect.fn("PropRecordRepo.reactiveDefs")(function* () {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            builtin: Tables.notes.builtin,
            prop_type: Tables.notes.prop_type,
            prop_default: Tables.notes.prop_default,
            prop_targets: Tables.notes.prop_targets,
          })
          .from(Tables.notes)
          .where(and(eq(Tables.notes._tag, "prop"), eq(Tables.notes.attrs_valid, 1)))
          .orderBy(asc(Tables.notes.title), asc(Tables.notes.id)),
      );

      return stream.pipe(Stream.mapEffect((rows) => decodeDefs(rows)));
    });

    return { reactiveDefs };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as PropRecordRepo from "./prop-record.repo";
