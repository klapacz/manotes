import { nanoid } from "nanoid";
import { Array, Effect, Layer, Context } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type * as SqlError from "effect/unstable/sql/SqlError";
import type * as GraphEncryption from "@manotes/shared/graph-encryption";
import { DisplayNameTakenError } from "@manotes/shared/graph-registry/contract";
import * as Schema from "./schema.ts";
import { EffectOption } from "@manotes/shared/effect/effect-option";

const GRAPH_ID_LENGTH = 12;

export class Service extends Context.Service<Service>()("GraphRegistryRepo.Service", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const listGraphs = Effect.fn("GraphRegistryRepo.listGraphs")(function* () {
      return yield* sql<Schema.RawRecord>`
        SELECT graphId, displayName, createdAt, graphKeyEnvelope
        FROM graphs
        ORDER BY displayName ASC
      `.pipe(Effect.flatMap(Schema.decodeArray));
    });

    const getGraph = Effect.fn("GraphRegistryRepo.getGraph")(function* ({
      graphId,
    }: {
      graphId: string;
    }) {
      return yield* sql<Schema.RawRecord>`
        SELECT graphId, displayName, createdAt, graphKeyEnvelope
        FROM graphs
        WHERE graphId = ${graphId}
        LIMIT 1
      `.pipe(Effect.map(Array.head), EffectOption.traverse(Schema.decodeRecord));
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

      return yield* sql<Schema.RawRecord>`
        INSERT INTO graphs ${sql.insert(values)}
        RETURNING graphId, displayName, createdAt, graphKeyEnvelope
      `.pipe(
        Effect.catchTag("SqlError", (error) => {
          return Effect.fail(remapDisplayNameSqlError(error, displayName));
        }),
        Effect.flatMap(Schema.decodeArray),
        Effect.map(Array.head),
        EffectOption.getOrEffect(() => Effect.die(new Error("Graph insert returned no rows"))),
      );
    });

    const renameGraph = Effect.fn("GraphRegistryRepo.renameGraph")(function* ({
      graphId,
      displayName,
    }: {
      graphId: string;
      displayName: string;
    }) {
      return yield* sql<Schema.RawRecord>`
        UPDATE graphs
        SET displayName = ${displayName}
        WHERE graphId = ${graphId}
        RETURNING graphId, displayName, createdAt, graphKeyEnvelope
      `.pipe(
        Effect.catchTag("SqlError", (error) => {
          return Effect.fail(remapDisplayNameSqlError(error, displayName));
        }),
        Effect.map(Array.head),
        EffectOption.traverse(Schema.decodeRecord),
      );
    });

    return {
      listGraphs,
      getGraph,
      createGraph,
      renameGraph,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

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

// Driver causes are opaque; keep the existing message-based fallback.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
function isDisplayNameUniquenessSqlError(error: unknown): boolean {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return message.includes("UNIQUE constraint failed") && message.includes("graphs.displayName");
}
