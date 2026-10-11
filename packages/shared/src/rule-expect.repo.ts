import { eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
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

export class Service extends Context.Service<Service>()("RuleExpectRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const deleteForRule = Effect.fn("RuleExpectRepo.deleteForRule")(function* (opts: {
      readonly ruleId: NoteSchema.Id;
    }) {
      yield* db.execute((db) =>
        db.delete(Tables.ruleExpects).where(eq(Tables.ruleExpects.ruleId, opts.ruleId)),
      );
    });

    const insert = Effect.fn("RuleExpectRepo.insert")(function* (opts: {
      readonly rows: ReadonlyArray<RuleExpectRow>;
    }) {
      const rows = yield* encodeRows(opts.rows);
      yield* db.execute((db) => db.insert(Tables.ruleExpects).values([...rows]));
    });

    return { deleteForRule, insert };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as RuleExpectRepo from "./rule-expect.repo";
