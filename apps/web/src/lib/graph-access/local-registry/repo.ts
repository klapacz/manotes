import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { Array, Effect, flow, Option, Stream, Schema as S } from "effect";
import * as Schema from "./schema";
import * as Errors from "./errors";
const GRAPH_COLUMNS =
  "localGraphId, displayName, status, mode, graphId, accountId, graphKeyEnvelope";

const decodeFirstRecordOption = (rows: ReadonlyArray<Schema.RawRecord>) =>
  Array.head(rows).pipe(
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: flow(Schema.decodeRecord, Effect.asSome),
    }),
  );

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS graphs (
      localGraphId TEXT PRIMARY KEY,
      displayName TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      mode TEXT NOT NULL,
      graphId TEXT,
      accountId TEXT,
      graphKeyEnvelope TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS graphs_graph_id_idx
    ON graphs (graphId)
    WHERE graphId IS NOT NULL
  `;

  // Run this separately from CREATE TABLE so existing installs get the new column too.
  yield* sql`ALTER TABLE graphs ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`.pipe(
    Effect.ignore,
  );
});

export const listGraphs = Effect.fn("LocalRegistryRepo.listGraphs")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<Schema.RawRecord>`
      SELECT ${sql.literal(GRAPH_COLUMNS)}
      FROM graphs
      ORDER BY displayName ASC
    `;

  return yield* Schema.decodeArray(rows);
});

export const getGraph = Effect.fn("LocalRegistryRepo.getGraph")(function* (localGraphId: string) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<Schema.RawRecord>`
    SELECT ${sql.literal(GRAPH_COLUMNS)}
    FROM graphs
    WHERE localGraphId = ${localGraphId}
    LIMIT 1
  `;

  return yield* decodeFirstRecordOption(rows);
});

export const insertGraph = SqlSchema.findOne({
  Request: Schema.Record,
  Result: Schema.Record,
  execute: Effect.fn("LocalRegistryRepo.insertGraph.execute")(function* (record) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      INSERT INTO graphs ${sql.insert(record)}
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `.pipe(
      Effect.catchTag("SqlError", (error) =>
        Effect.fail(Errors.remapDisplayNameSqlError(error, record.displayName)),
      ),
    );
  }),
});

export const updateGraph = SqlSchema.findOne({
  Request: Schema.Record,
  Result: Schema.Record,
  execute: Effect.fn(function* (values) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      UPDATE graphs SET ${sql.update(values, ["localGraphId"])}
      WHERE localGraphId = ${values.localGraphId}
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `;
  }),
});

export const renameGraph = SqlSchema.findOne({
  Request: S.Struct({
    localGraphId: S.String,
    displayName: S.String,
  }),
  Result: Schema.Record,
  execute: Effect.fn("LocalRegistryRepo.renameGraph.execute")(function* ({
    localGraphId,
    displayName,
  }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      UPDATE graphs
      SET displayName = ${displayName}
      WHERE localGraphId = ${localGraphId}
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `.pipe(
      Effect.catchTag("SqlError", (error) =>
        Effect.fail(Errors.remapDisplayNameSqlError(error, displayName)),
      ),
    );
  }),
});

const LocalGraphIdRequest = S.Struct({
  localGraphId: S.String,
});

export const markGraphDeleting = SqlSchema.findOne({
  Request: LocalGraphIdRequest,
  Result: Schema.Record,
  execute: Effect.fn("LocalRegistryRepo.markGraphDeleting.execute")(function* ({ localGraphId }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      UPDATE graphs
      SET status = 'deleting'
      WHERE localGraphId = ${localGraphId}
        AND mode = 'local'
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `;
  }),
});

export const deleteLocalGraph = SqlSchema.findOne({
  Request: LocalGraphIdRequest,
  Result: Schema.Record,
  execute: Effect.fn("LocalRegistryRepo.deleteLocalGraph.execute")(function* ({ localGraphId }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      DELETE FROM graphs
      WHERE localGraphId = ${localGraphId}
        AND mode = 'local'
        AND status = 'deleting'
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `;
  }),
});

export const getGraphByGraphId = SqlSchema.findOneOption({
  Request: S.Struct({
    graphId: S.String,
  }),
  Result: Schema.Record,
  execute: Effect.fn("LocalRegistryRepo.getGraphByGraphId.execute")(function* ({ graphId }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      SELECT ${sql.literal(GRAPH_COLUMNS)}
      FROM graphs
      WHERE graphId = ${graphId}
      LIMIT 1
    `;
  }),
});

export const findGraphReactive = Effect.fn("LocalRegistryRepo.findGraphReactive")(function* (
  localGraphId: string,
) {
  const sql = yield* SqlClient.SqlClient;

  return sql
    .reactive(
      ["graphs"],
      sql<Schema.RawRecord>`
        SELECT ${sql.literal(GRAPH_COLUMNS)}
        FROM graphs
        WHERE localGraphId = ${localGraphId}
        LIMIT 1
      `,
    )
    .pipe(Stream.mapEffect(decodeFirstRecordOption));
}, Stream.unwrap);

export const reactiveListGraph = Effect.fn("LocalRegistryRepo.reactiveListGraph")(function* () {
  const sql = yield* SqlClient.SqlClient;

  return sql
    .reactive(
      ["graphs"],
      sql<Schema.RawRecord>`
        SELECT ${sql.literal(GRAPH_COLUMNS)}
        FROM graphs
        ORDER BY displayName ASC
      `,
    )
    .pipe(Stream.mapEffect((rows) => Schema.decodeArray(rows)));
}, Stream.unwrap);
