import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

export class Service extends Context.Service<Service>()("RuleExpectRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const deleteForRule = Effect.fn("RuleExpectRepo.deleteForRule")(function* (opts: {
      readonly ruleId: NoteSchema.Id;
    }) {
      yield* db.query((db) =>
        db
          .delete(Tables.ruleExpects)
          .where(eq(Tables.ruleExpects.ruleId, opts.ruleId))
          .returning({ ruleId: Tables.ruleExpects.ruleId }),
      );
    });

    const insert = Effect.fn("RuleExpectRepo.insert")(function* (opts: {
      readonly rows: ReadonlyArray<Tables.RuleExpectRow>;
    }) {
      yield* db.query((db) =>
        db
          .insert(Tables.ruleExpects)
          .values([...opts.rows])
          .returning({ ruleId: Tables.ruleExpects.ruleId }),
      );
    });

    return { deleteForRule, insert };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as RuleExpectRepo from "./rule-expect.repo";
