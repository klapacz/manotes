import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Array, Schema } from "effect";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";
import { AttrsSchema } from "./attrs.schema";

export const PropRow = Schema.Struct({
  recordId: NoteSchema.Id,
  propId: NoteSchema.Id,
  value: Schema.NullOr(Schema.fromJsonString(AttrsSchema.PropVal)),
});

export type PropRow = typeof PropRow.Type;

const encodeRows = Schema.encodeEffect(Schema.Array(PropRow));

export class Service extends Context.Service<Service>()("PropRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const deleteForRecord = Effect.fn("PropRepo.deleteForRecord")(function* (opts: {
      readonly recordId: NoteSchema.Id;
    }) {
      yield* db.execute((db) =>
        db.delete(Tables.props).where(eq(Tables.props.recordId, opts.recordId)),
      );
    });

    const insert = Effect.fn("PropRepo.insert")(function* (opts: {
      readonly rows: Array.NonEmptyReadonlyArray<PropRow>;
    }) {
      const rows = yield* encodeRows(opts.rows);
      yield* db.execute((db) => db.insert(Tables.props).values([...rows]));
    });

    return { deleteForRecord, insert };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as PropRepo from "./prop.repo";
