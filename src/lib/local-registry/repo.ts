import { SqlClient } from "@effect/sql";
import { nanoid } from "nanoid";
import { Array, Effect, flow, Option, Stream } from "effect";
import * as Schema from "./schema";
import * as Errors from "./errors";

const LOCAL_GRAPH_ID_LENGTH = 6;

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS graphs (
      localGraphId TEXT PRIMARY KEY,
      displayName TEXT NOT NULL UNIQUE,
      origin TEXT NOT NULL,
      graphId TEXT,
      accountId TEXT
    )
  `;
});

export const listGraphs = Effect.fn("LocalRegistryRepo.listGraphs")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Schema.Record>`
      SELECT localGraphId, displayName, origin, graphId, accountId
      FROM graphs
      ORDER BY displayName ASC
    `;

    return yield* Schema.decodeArray(rows);
  },
);

export const getGraph = Effect.fn("LocalRegistryRepo.getGraph")(function* (
  localGraphId: string,
) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<Schema.Record>`
    SELECT localGraphId, displayName, origin, graphId, accountId
    FROM graphs
    WHERE localGraphId = ${localGraphId}
    LIMIT 1
  `;

  return yield* Array.head(rows).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: flow(Schema.decodeRecord, Effect.asSome),
    }),
  );
});

export const createGraph = Effect.fn("LocalRegistryRepo.createGraph")(
  function* (displayName: string) {
    const sql = yield* SqlClient.SqlClient;

    const existing = yield* sql<{ localGraphId: string }>`
      SELECT localGraphId
      FROM graphs
      WHERE displayName = ${displayName}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return yield* new Errors.DisplayNameTakenError({ displayName });
    }

    const newGraphs = yield* Schema.encodeRecord({
      localGraphId: nanoid(LOCAL_GRAPH_ID_LENGTH),
      displayName,
      origin: "local",
      graphId: null,
      accountId: null,
    }).pipe(Effect.map((record) => [record]));

    const rows = yield* sql<Schema.Record>`
      INSERT INTO graphs ${sql.insert(newGraphs)}
      RETURNING localGraphId, displayName, origin, graphId, accountId
    `;

    const created = yield* Schema.decodeArray(rows);
    const head = Array.head(created);

    if (Option.isNone(head)) {
      return yield* Effect.dieMessage("Graph insert returned no rows");
    }

    return head.value;
  },
);

export function reactiveListGraph() {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return sql
        .reactive(
          ["graphs"],
          sql<Schema.Record>`
            SELECT localGraphId, displayName, origin, graphId, accountId
            FROM graphs
            ORDER BY displayName ASC
          `,
        )
        .pipe(Stream.mapEffect(Schema.decodeArray));
    }),
  );
}
