import { asc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";
import { AttrsSchema } from "./attrs.schema";

export const RuleExpectRow = Schema.Struct({
  ruleId: NoteSchema.Id,
  propId: NoteSchema.Id,
  value: Schema.NullOr(Schema.fromJsonString(AttrsSchema.RuleExpectation)),
});

export type RuleExpectRow = typeof RuleExpectRow.Type;

const encodeRows = Schema.encodeEffect(Schema.Array(RuleExpectRow));

const decodeRows = Schema.decodeEffect(Schema.Array(RuleExpectRow));

export class Service extends Context.Service<Service>()("RuleExpectRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const deleteForRule = Effect.fn("RuleExpectRepo.deleteForRule")(function* (opts: {
      readonly ruleId: NoteSchema.Id;
    }) {
      yield* db.execute((db) => {
        return db.delete(Tables.ruleExpects).where(eq(Tables.ruleExpects.ruleId, opts.ruleId));
      });
    });

    const insert = Effect.fn("RuleExpectRepo.insert")(function* (opts: {
      readonly rows: ReadonlyArray<RuleExpectRow>;
    }) {
      const rows = yield* encodeRows(opts.rows);
      yield* db.execute((db) => db.insert(Tables.ruleExpects).values([...rows]));
    });

    const reactiveAll = Effect.fn("RuleExpectRepo.reactiveAll")(function* () {
      const rows = yield* db.reactiveQuery((db) => {
        return db
          .select()
          .from(Tables.ruleExpects)
          .orderBy(asc(Tables.ruleExpects.ruleId), asc(Tables.ruleExpects.propId));
      });

      return rows.pipe(Stream.mapEffect((rows) => decodeRows(rows)));
    });

    return { deleteForRule, insert, reactiveAll };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as RuleExpectRepo from "./rule-expect.repo";
