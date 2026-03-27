import type * as SqlError from "@effect/sql/SqlError";
import { SqlClient } from "@effect/sql";
import { nanoid } from "nanoid";
import { Array, Effect, flow, Option } from "effect";
import type * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as Schema from "./schema";
import { DisplayNameTakenError } from "@manotes/shared/graph-registry/contract";

const GRAPH_ID_LENGTH = 12;

export class Service extends Effect.Service<Service>()("GraphRegistryRepo.Service", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const listGraphs = Effect.fn("GraphRegistryRepo.listGraphs")(function* () {
      const rows = yield* sql<Schema.RawRecord>`
        SELECT graphId, displayName, createdAt, graphKeyEnvelope
        FROM graphs
        ORDER BY displayName ASC
      `;

      return yield* Schema.decodeArray(rows);
    });

    const getGraph = Effect.fn("GraphRegistryRepo.getGraph")(function* ({
      graphId,
    }: {
      graphId: string;
    }) {
      const rows = yield* sql<Schema.RawRecord>`
        SELECT graphId, displayName, createdAt, graphKeyEnvelope
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

    const createGraph = Effect.fn("GraphRegistryRepo.createGraph")(function* ({
      displayName,
      graphKeyEnvelope,
    }: {
      displayName: string;
      graphKeyEnvelope: GraphEncryption.GraphKeyEnvelope;
    }) {
      const values = yield* Schema.encodeRecord({
        graphId: nanoid(GRAPH_ID_LENGTH),
        displayName,
        createdAt: new Date().toISOString(),
        graphKeyEnvelope,
      });

      const rows = yield* sql<Schema.RawRecord>`
        INSERT INTO graphs ${sql.insert(values)}
        RETURNING graphId, displayName, createdAt, graphKeyEnvelope
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
    });

    const renameGraph = Effect.fn("GraphRegistryRepo.renameGraph")(function* ({
      graphId,
      displayName,
    }: {
      graphId: string;
      displayName: string;
    }) {
      const rows = yield* sql<Schema.RawRecord>`
        UPDATE graphs
        SET displayName = ${displayName}
        WHERE graphId = ${graphId}
        RETURNING graphId, displayName, createdAt, graphKeyEnvelope
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
    });

    return {
      listGraphs,
      getGraph,
      createGraph,
      renameGraph,
    };
  }),
}) {}

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS graphs (
      graphId TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      graphKeyEnvelope TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS graphs_display_name_idx
    ON graphs (displayName)
  `;
});

function remapDisplayNameSqlError(error: SqlError.SqlError, displayName: string) {
  if (isDisplayNameUniquenessSqlError(error.cause)) {
    return new DisplayNameTakenError({ displayName });
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

  return message.includes("UNIQUE constraint failed") && message.includes("graphs.displayName");
}
