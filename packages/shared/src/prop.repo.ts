import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Array } from "effect";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

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
      readonly rows: Array.NonEmptyReadonlyArray<Tables.PropRow>;
    }) {
      yield* db.execute((db) => db.insert(Tables.props).values([...opts.rows]));
    });

    return { deleteForRecord, insert };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as PropRepo from "./prop.repo";
