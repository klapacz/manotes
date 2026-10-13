import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { DB } from "@manotes/shared/db.service";
import { Tables } from "@manotes/shared/db.tables";
import { NoteFilter } from "@manotes/shared/note/filter";
import { Effect, Exit, Layer, Stream } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { SqlClient } from "effect/sql";
import { Query } from "effect-qb";
import { describe, expect, it } from "vite-plus/test";
import { CliDB } from "./cli.db";

type CheckpointUpdate = Pick<Tables.MaterializationCheckpoint, "lastAppliedLocalSeq" | "updatedAt">;

const database = CliDB.layer.pipe(
  Layer.provide(Layer.succeed(DB.Config, { localGraphId: "graph", databasePath: ":memory:" })),
  Layer.provide(NodeServices.layer),
  Layer.provide(Reactivity.layer),
);

describe("automatic reactive query dependencies", () => {
  it("refreshes when only a nested property or backlink table changes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        // Let the CLI hook fiber install its triggers before the first write.
        yield* Effect.yieldNow;
        const sql = yield* SqlClient.SqlClient;
        const db = yield* DB.Service;
        yield* sql`INSERT INTO notes (id, content, text, date, createdAt, updatedAt, lastEventLocalSeq)
          VALUES ('note', '{}', 'body', '2026-10-13', '2026-10-13', '2026-10-13', 0)`;

        const stream = yield* db.reactiveQuery(
          Query.select({ id: Tables.notes.id }).pipe(
            Query.from(Tables.notes),
            Query.where(
              NoteFilter.filterPredicate({
                sort: "updated",
                props: {
                  [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
                },
                backlinksTo: "project",
              }),
            ),
          ),
        );

        const pull = yield* Stream.toPull(
          stream.pipe(Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b))),
        );

        expect((yield* pull)[0]).toEqual([]);

        yield* sql`INSERT INTO backlinks VALUES ('note', 'project')`;
        expect((yield* pull)[0]).toEqual([{ id: "note" }]);

        yield* sql`INSERT INTO props VALUES ('note', '[]', ${BuiltinAttrs.archivedId}, '{"_tag":"bool","val":true}')`;
        expect((yield* pull)[0]).toEqual([]);

        yield* sql`UPDATE props SET value = '{"_tag":"bool","val":false}' WHERE recordId = 'note'`;
        expect((yield* pull)[0]).toEqual([{ id: "note" }]);

        yield* sql`DELETE FROM backlinks WHERE sourceId = 'note'`;
        expect((yield* pull)[0]).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(database), Effect.timeout("5 seconds")),
    );
  });

  it("omits undefined update fields and preserves the stored values", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* DB.Service;
        yield* db.execute(
          Query.insert(Tables.materializationCheckpoint, {
            id: 1,
            lastAppliedLocalSeq: 4,
            updatedAt: "before",
          }),
        );
        yield* db.execute(
          Query.insert(Tables.materializationCheckpoint, {
            id: 1,
            lastAppliedLocalSeq: 99,
            updatedAt: "ignored",
          }).pipe(Query.onConflict("id")),
        );

        const values: Partial<CheckpointUpdate> = {
          lastAppliedLocalSeq: undefined,
          updatedAt: "after",
        };

        yield* db.execute(
          Query.update(Tables.materializationCheckpoint, values).pipe(
            Query.where(Query.eq(Tables.materializationCheckpoint.id, 1)),
          ),
        );

        expect(
          yield* db.query(
            Query.select(Tables.materializationCheckpoint.columns).pipe(
              Query.from(Tables.materializationCheckpoint),
            ),
          ),
        ).toEqual([{ id: 1, lastAppliedLocalSeq: 4, updatedAt: "after" }]);

        const empty: Partial<CheckpointUpdate> = { updatedAt: undefined };
        expect(
          Exit.isFailure(
            yield* Effect.exit(db.execute(Query.update(Tables.materializationCheckpoint, empty))),
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(database)),
    );
  });
});
