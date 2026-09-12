import { Effect, Array, Order } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";
import * as EventSchema from "./schema.ts";
import type { NonEmptyReadonlyArray } from "effect/Array";

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS events (
      commitSeq INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      streamRef BLOB NOT NULL,
      payload BLOB NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS events_stream_ref_idx
    ON events (streamRef, commitSeq)
  `;
});

export const getLastCommitSeq = Effect.fn("GraphSyncRepo.getLastCommitSeq")(function* () {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{ maxCommitSeq: number }>`
      SELECT COALESCE(MAX(commitSeq), 0) AS maxCommitSeq
      FROM events
    `;

  return rows[0]?.maxCommitSeq ?? 0;
});

export const getEventsBetweenSeq = Effect.fn("GraphSyncRepo.getEventsBetweenSeq")(
  function* (filter: { afterSeq: number; upToCommitSeq: number }) {
    const sql = yield* SqlClient.SqlClient;

    const rows = yield* sql<EventSchema.RawRecord>`
    SELECT commitSeq, id, streamRef, payload, createdAt
    FROM events
    WHERE commitSeq > ${filter.afterSeq} AND commitSeq <= ${filter.upToCommitSeq}
    ORDER BY commitSeq ASC
  `;

    return yield* EventSchema.decodeArray(rows);
  },
);

export const insertEvents = Effect.fn("GraphSyncRepo.insertEvents")(function* (
  events: NonEmptyReadonlyArray<Messages.PendingEvent>,
) {
  const newEvents = yield* EventSchema.encodeCreateRecords(events);
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<EventSchema.RawRecord>`
    INSERT INTO events ${sql.insert(newEvents)}
    RETURNING commitSeq, id, streamRef, payload, createdAt
  `;

  if (!Array.isReadonlyArrayNonEmpty(rows)) {
    return yield* Effect.die(new Error("Non-empty insert returned no rows"));
  }

  const committed = yield* EventSchema.decodeNonEmptyArray(rows);

  // `INSERT ... RETURNING` does not guarantee row order, but every sync batch
  // we emit must be ordered by ascending `commitSeq` to satisfy the protocol.
  return Array.sort(committed, OrderEventByCommitSeq);
});

const OrderEventByCommitSeq = Order.mapInput(
  Order.Number,
  (event: Messages.CommittedEvent) => event.commitSeq,
);
