import { SqlClient } from "@effect/sql";
import { nanoid } from "nanoid";
import { Array, Cause, Effect, Exit, flow, Option, Stream } from "effect";
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
    );

    CREATE UNIQUE INDEX IF NOT EXISTS graphs_graph_id_idx
    ON graphs (graphId)
    WHERE graphId IS NOT NULL
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
    `.pipe(
      Effect.catchTag("SqlError", (error) =>
        Effect.fail(Errors.remapDisplayNameSqlError(error, displayName)),
      ),
    );

    const created = yield* Schema.decodeArray(rows);
    const head = Array.head(created);

    if (Option.isNone(head)) {
      return yield* Effect.dieMessage("Graph insert returned no rows");
    }

    return head.value;
  },
);

export const getGraphByGraphId = Effect.fn(
  "LocalRegistryRepo.getGraphByGraphId",
)(function* (graphId: string) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<Schema.Record>`
    SELECT localGraphId, displayName, origin, graphId, accountId
    FROM graphs
    WHERE graphId = ${graphId}
    LIMIT 1
  `;

  return yield* Array.head(rows).pipe(
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: flow(Schema.decodeRecord, Effect.asSome),
    }),
  );
});

export const createCloudGraph = Effect.fn("LocalRegistryRepo.createCloudGraph")(
  function* ({
    graphId,
    displayName,
  }: {
    graphId: string;
    displayName: string;
  }) {
    // Return early if the graph already exists
    const existing = yield* getGraphByGraphId(graphId);
    if (Option.isSome(existing)) return existing.value;

    const sql = yield* SqlClient.SqlClient;

    const values = yield* Schema.encodeRecord({
      localGraphId: nanoid(LOCAL_GRAPH_ID_LENGTH),
      displayName,
      origin: "cloud",
      graphId,
      accountId: null,
    });
    const insertExit = yield* sql<Schema.Record>`
      INSERT INTO graphs ${sql.insert(values)}
      RETURNING localGraphId, displayName, origin, graphId, accountId
    `.pipe(Effect.exit);

    const rows = yield* Exit.match(insertExit, {
      onSuccess: Effect.succeed,
      onFailure: (cause) =>
        Effect.gen(function* () {
          const failure = Cause.failureOption(cause);
          if (Option.isNone(failure)) return yield* Effect.failCause(cause);

          // On unique constraint violation, check if the graph already exists
          if (Errors.isGraphIdUniquenessSqlError(failure.value.cause)) {
            const existing = yield* getGraphByGraphId(graphId);

            if (Option.isSome(existing)) return [existing.value];
          }

          return yield* Effect.fail(
            Errors.remapDisplayNameSqlError(failure.value, displayName),
          );
        }),
    });

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
