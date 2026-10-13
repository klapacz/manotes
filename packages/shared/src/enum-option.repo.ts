import { Query } from "effect-qb";
import { NoteFilter } from "./note/filter";
import { Context, Effect, Layer } from "effect";
import { BuiltinAttrs } from "./builtin-attrs";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

export type Item = Pick<Tables.Note, "id" | "title" | "text">;

export class Service extends Context.Service<Service>()("EnumOptionRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const reactiveOptions = Effect.fn("EnumOptionRepo.reactiveOptions")(function* (opts: {
      readonly enum_parent: NoteSchema.Id;
    }) {
      const stream = yield* db.reactiveQuery(
        Query.select({
          id: Tables.notes.id,
          title: Tables.notes.title,
          text: Tables.notes.text,
        }).pipe(
          Query.from(Tables.notes),
          Query.where(
            Query.and(
              Query.eq(Tables.notes._tag, "owned"),
              Query.eq(Tables.notes.owned_type, "enum_option"),
              Query.eq(Tables.notes.owned_parent, opts.enum_parent),
              NoteFilter.propertyPredicate(
                BuiltinAttrs.archivedId,
                BuiltinAttrs.archived.prop_default,
              ),
            ),
          ),
          Query.orderBy(Tables.notes.title),
          Query.orderBy(Tables.notes.id),
        ),
      );

      return stream;
    });

    return { reactiveOptions };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as EnumOptionRepo from "./enum-option.repo";
