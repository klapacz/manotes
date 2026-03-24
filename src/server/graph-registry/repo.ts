import type * as SqlError from "@effect/sql/SqlError";
import { SqlClient } from "@effect/sql";
import { nanoid } from "nanoid";
import { Array, Effect, flow, Option } from "effect";
import * as Errors from "./errors";
import * as Schema from "./schema";

const GRAPH_ID_LENGTH = 12;

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS graphs (
      graphId TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      wrappedGraphKey BLOB,
      encryptionMetadata TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS graphs_display_name_idx
    ON graphs (displayName)
  `;
});

export const listGraphs = Effect.fn("GraphRegistryRepo.listGraphs")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<Schema.Record>`
    SELECT graphId, displayName, createdAt
    FROM graphs
    ORDER BY displayName ASC
  `;

    return yield* Schema.decodeArray(rows);
  },
);

export const getGraph = Effect.fn("GraphRegistryRepo.getGraph")(function* ({
  graphId,
}: {
  graphId: string;
}) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<Schema.Record>`
    SELECT graphId, displayName, createdAt
    FROM graphs
    WHERE graphId = ${graphId}
    LIMIT 1
  `;

  return yield* Array.head(rows).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: flow(Schema.decodeRecord, Effect.asSome),
    }),
  );
});

export const createGraph = Effect.fn("GraphRegistryRepo.createGraph")(
  function* ({ displayName }: { displayName: string }) {
    const sql = yield* SqlClient.SqlClient;

    const rows = yield* sql<Schema.Record>`
    INSERT INTO graphs ${sql.insert([
      {
        graphId: nanoid(GRAPH_ID_LENGTH),
        displayName,
        createdAt: new Date().toISOString(),
      },
    ])}
    RETURNING graphId, displayName, createdAt
  `.pipe(
      Effect.catchTag("SqlError", (error) =>
        Effect.fail(remapDisplayNameSqlError(error, displayName)),
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

export const renameGraph = Effect.fn("GraphRegistryRepo.renameGraph")(
  function* ({
    graphId,
    displayName,
  }: {
    graphId: string;
    displayName: string;
  }) {
    const sql = yield* SqlClient.SqlClient;

    const rows = yield* sql<Schema.Record>`
    UPDATE graphs
    SET displayName = ${displayName}
    WHERE graphId = ${graphId}
    RETURNING graphId, displayName, createdAt
  `.pipe(
      Effect.catchTag("SqlError", (error) =>
        Effect.fail(remapDisplayNameSqlError(error, displayName)),
      ),
    );

    return yield* Array.head(rows).pipe(
      Option.match({
        onNone: () => Effect.succeed(Option.none()),
        onSome: flow(Schema.decodeRecord, Effect.asSome),
      }),
    );
  },
);

function remapDisplayNameSqlError(
  error: SqlError.SqlError,
  displayName: string,
) {
  if (isDisplayNameUniquenessSqlError(error.cause)) {
    return new Errors.DisplayNameTakenError({ displayName });
  }

  return error;
}

function isDisplayNameUniquenessSqlError(error: unknown): boolean {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("graphs.displayName")
  );
}
