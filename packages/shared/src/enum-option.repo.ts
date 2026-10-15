import { and, asc, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { BuiltinAttrs } from "./builtin-attrs";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";
import { AttrsSchema } from "./attrs.schema";
import { PropFilterSql } from "./prop-filter.sql";

export const Item = Schema.Struct({
  id: NoteSchema.Id,
  title: Schema.NullOr(Schema.String),
  text: Schema.String,
});

export type Item = typeof Item.Type;

const decodeItems = Schema.decodeEffect(Schema.Array(Item));

export class Service extends Context.Service<Service>()("EnumOptionRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveOptions = Effect.fn("EnumOptionRepo.reactiveOptions")(function* (opts: {
      readonly enum_parent: NoteSchema.Id;
    }) {
      const stream = yield* db.reactiveQuery((db) => {
        return db
          .select({ id: Tables.notes.id, title: Tables.notes.title, text: Tables.notes.text })
          .from(Tables.notes)
          .where(
            and(
              eq(Tables.notes._tag, "owned"),
              eq(Tables.notes.owned_type, "enum_option"),
              eq(Tables.notes.owned_parent, opts.enum_parent),
              PropFilterSql.equals({
                propId: BuiltinAttrs.archivedId,
                value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
                defaultValue: sql`${JSON.stringify(BuiltinAttrs.archived.prop_default)}`,
              }),
            ),
          )
          .orderBy(asc(Tables.notes.title), asc(Tables.notes.id));
      });

      return stream.pipe(Stream.mapEffect((rows) => decodeItems(rows)));
    });

    return { reactiveOptions };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as EnumOptionRepo from "./enum-option.repo";
