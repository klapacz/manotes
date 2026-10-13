import { Query } from "effect-qb";
import { Array, Context, Effect, Layer, type Stream } from "effect";
import type * as Sqlite from "effect-qb/sqlite";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { NoteSchema } from "./note.schema";

export class Service extends Context.Service<Service>()("RuleExpectRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const deleteForRule = Effect.fn("RuleExpectRepo.deleteForRule")(function* (opts: {
      readonly ruleId: NoteSchema.Id;
    }) {
      yield* db.execute(
        Query.delete(Tables.ruleExpects).pipe(
          Query.where(Query.eq(Tables.ruleExpects.ruleId, opts.ruleId)),
        ),
      );
    });

    const insert = Effect.fn("RuleExpectRepo.insert")(function* (opts: {
      readonly rows: Array.NonEmptyReadonlyArray<Tables.RuleExpect>;
    }) {
      yield* db.execute(
        Query.insert(Tables.ruleExpects).pipe(Query.from(DB.values(Tables.ruleExpects, opts.rows))),
      );
    });

    const reactiveAll = Effect.fn("RuleExpectRepo.reactiveAll")(function* (): Effect.fn.Return<
      Stream.Stream<
        ReadonlyArray<Tables.RuleExpect>,
        Sqlite.Executor.SqliteExecutorError | Sqlite.Errors.SqliteReadQueryError
      >
    > {
      const rows = yield* db.reactiveQuery(
        Query.select(Tables.ruleExpects.columns).pipe(
          Query.from(Tables.ruleExpects),
          Query.orderBy(Tables.ruleExpects.ruleId),
          Query.orderBy(Tables.ruleExpects.propId),
        ),
      );

      return rows;
    });

    return { deleteForRule, insert, reactiveAll };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export * as RuleExpectRepo from "./rule-expect.repo";
