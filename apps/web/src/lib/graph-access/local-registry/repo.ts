import { SqlClient, SqlSchema } from "effect/sql";
import { Array, Effect, Option, Stream, Schema } from "effect";
import { LocalRegistrySchema } from "./schema";
import { LocalRegistryErrors } from "./errors";
import { GraphEncryption } from "@manotes/shared/graph-encryption";

const GRAPH_COLUMNS =
  "localGraphId, displayName, status, mode, graphId, accountId, graphKeyEnvelope";

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
    WHERE graphId IS NOT NULL;

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      openaiApiKey TEXT
    )
  `;

  // Run this separately from CREATE TABLE so existing installs get the new column too.
  yield* sql`ALTER TABLE graphs ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`.pipe(
    Effect.ignore,
  );

  yield* sql`ALTER TABLE graphs ADD COLUMN rememberedGraphKey TEXT`.pipe(Effect.ignore);
});

export const listGraphs = SqlSchema.findAll({
  Request: Schema.Struct({
    accountId: Schema.Option(Schema.String),
  }),
  Result: LocalRegistrySchema.Record,
  execute: Effect.fn("LocalRegistryRepo.listGraphs.execute")(function* ({ accountId }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* Option.match(accountId, {
      onNone: () => {
        return sql`
        SELECT ${sql.literal(GRAPH_COLUMNS)}
        FROM graphs
        WHERE mode = 'local'
        ORDER BY displayName ASC
      `;
      },
      onSome: (id) => {
        return sql`
        SELECT ${sql.literal(GRAPH_COLUMNS)}
        FROM graphs
        WHERE mode = 'local' OR accountId = ${id}
        ORDER BY displayName ASC
      `;
      },
    });
  }),
});

export const findGraph = SqlSchema.findOneOption({
  Request: Schema.Struct({
    localGraphId: Schema.String,
  }),
  Result: LocalRegistrySchema.Record,
  execute: Effect.fn("LocalRegistryRepo.findGraph.execute")(function* ({ localGraphId }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      SELECT ${sql.literal(GRAPH_COLUMNS)}
      FROM graphs
      WHERE localGraphId = ${localGraphId}
      LIMIT 1
    `;
  }),
});

const RememberedKeyRequest = Schema.Struct({
  envelope: Schema.fromJsonString(GraphEncryption.GraphKeyEnvelopeSchema),
});

const RememberedKeyResult = Schema.Struct({
  rememberedGraphKey: Schema.Uint8ArrayFromBase64.pipe(
    Schema.check(Schema.isMinLength(32), Schema.isMaxLength(32)),
  ),
});

export const findRememberedKey = SqlSchema.findOneOption({
  Request: RememberedKeyRequest,
  Result: RememberedKeyResult,
  execute: Effect.fn("LocalRegistryRepo.findRememberedKey.execute")(function* ({ envelope }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      SELECT rememberedGraphKey FROM graphs
      WHERE graphKeyEnvelope = ${envelope}
        AND mode = 'cloud' AND status = 'active'
        AND rememberedGraphKey IS NOT NULL
      LIMIT 1
    `;
  }),
});

export const findRememberedKeyReactive = Effect.fn("LocalRegistryRepo.findRememberedKeyReactive")(
  function* (input: typeof RememberedKeyRequest.Type) {
    const sql = yield* SqlClient.SqlClient;

    return sql.reactive(["graphs"], findRememberedKey(input));
  },
  Stream.unwrap,
);

export const saveRememberedKey = SqlSchema.findOne({
  Request: Schema.Struct({
    ...RememberedKeyRequest.fields,
    graphKey: RememberedKeyResult.fields.rememberedGraphKey,
  }),
  Result: Schema.Struct({ localGraphId: Schema.String }),
  execute: Effect.fn("LocalRegistryRepo.saveRememberedKey.execute")(function* ({
    envelope,
    graphKey,
  }) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      UPDATE graphs SET rememberedGraphKey = ${graphKey}
      WHERE graphKeyEnvelope = ${envelope} AND mode = 'cloud' AND status = 'active'
      RETURNING localGraphId
    `;
  }),
});

export const forgetRememberedKey = SqlSchema.void({
  Request: RememberedKeyRequest,
  execute: Effect.fn("LocalRegistryRepo.forgetRememberedKey.execute")(function* ({ envelope }) {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`UPDATE graphs SET rememberedGraphKey = NULL WHERE graphKeyEnvelope = ${envelope}`;
  }),
});

export const insertGraph = SqlSchema.findOne({
  Request: LocalRegistrySchema.Record,
  Result: LocalRegistrySchema.Record,
  execute: Effect.fn("LocalRegistryRepo.insertGraph.execute")(function* (record) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      INSERT INTO graphs ${sql.insert(record)}
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `.pipe(
      Effect.catchTag("SqlError", (error) => {
        return Effect.fail(LocalRegistryErrors.remapDisplayNameSqlError(error, record.displayName));
      }),
    );
  }),
});

export const updateGraph = SqlSchema.findOne({
  Request: LocalRegistrySchema.Record,
  Result: LocalRegistrySchema.Record,
  execute: Effect.fn(function* (values) {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql`
      UPDATE graphs SET ${sql.update({ ...values, rememberedGraphKey: null }, ["localGraphId"])}
      WHERE localGraphId = ${values.localGraphId}
      RETURNING ${sql.literal(GRAPH_COLUMNS)}
    `;
  }),
});

export const renameGraph = SqlSchema.findOne({
  Request: Schema.Struct({
    localGraphId: Schema.String,
    displayName: Schema.String,
  }),
  Result: LocalRegistrySchema.Record,
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
      Effect.catchTag("SqlError", (error) => {
        return Effect.fail(LocalRegistryErrors.remapDisplayNameSqlError(error, displayName));
      }),
    );
  }),
});

const LocalGraphIdRequest = Schema.Struct({
  localGraphId: Schema.String,
});

export const markGraphDeleting = SqlSchema.findOne({
  Request: LocalGraphIdRequest,
  Result: LocalRegistrySchema.Record,
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
  Result: LocalRegistrySchema.Record,
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

export const findGraphByGraphId = SqlSchema.findOneOption({
  Request: Schema.Struct({
    graphId: Schema.String,
  }),
  Result: LocalRegistrySchema.Record,
  execute: Effect.fn("LocalRegistryRepo.findGraphByGraphId.execute")(function* ({ graphId }) {
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
      sql<LocalRegistrySchema.RawRecord>`
        SELECT ${sql.literal(GRAPH_COLUMNS)}
        FROM graphs
        WHERE localGraphId = ${localGraphId}
        LIMIT 1
      `,
    )
    .pipe(
      Stream.mapEffect((rows) => LocalRegistrySchema.decodeArray(rows)),
      Stream.map(Array.head),
    );
}, Stream.unwrap);

export const reactiveListGraph = Effect.fn("LocalRegistryRepo.reactiveListGraph")(function* ({
  accountId,
}: {
  accountId: Option.Option<string>;
}) {
  const sql = yield* SqlClient.SqlClient;

  const query = Option.match(accountId, {
    onNone: () => {
      return sql<LocalRegistrySchema.RawRecord>`
      SELECT ${sql.literal(GRAPH_COLUMNS)}
      FROM graphs
      WHERE mode = 'local'
      ORDER BY displayName ASC
    `;
    },
    onSome: (id) => {
      return sql<LocalRegistrySchema.RawRecord>`
      SELECT ${sql.literal(GRAPH_COLUMNS)}
      FROM graphs
      WHERE mode = 'local' OR accountId = ${id}
      ORDER BY displayName ASC
    `;
    },
  });

  return sql
    .reactive(["graphs"], query)
    .pipe(Stream.mapEffect((rows) => LocalRegistrySchema.decodeArray(rows)));
}, Stream.unwrap);

export * as LocalRegistryRepo from "./repo";
