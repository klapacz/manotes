import type * as SqlError from "@effect/sql/SqlError";
import { Array, Data, Effect, Match } from "effect";
import { MAX_EVENTS_PER_COMMIT } from "../../lib/graph-sync/contract/limits";
import * as Messages from "../../lib/graph-sync/contract/messages";
import * as Errors from "./errors";
import * as Repo from "./repo";

export class ResponsePlan extends Data.TaggedClass("ResponsePlan")<{
  reply: ReadonlyArray<Messages.ServerMessage>;
  broadcast: ReadonlyArray<Messages.ServerMessage>;
}> {}

class ExecutionPlan<E, R> extends Data.TaggedClass("ExecutionPlan")<{
  effect: Effect.Effect<ResponsePlan, E, R>;
  runSerialized: boolean;
}> {}

// Server-side protocol entrypoint: either bootstrap a reconnecting client
// with the missing committed suffix, or reconcile a new commit attempt over
// opaque encrypted event payloads keyed by stable stream references.
export function getExecutionPlan(message: Messages.ClientMessage) {
  return Match.value(message).pipe(
    Match.tag(
      "Commit",
      (message) =>
        new ExecutionPlan({
          effect: handleCommit(message),
          // Serialize commits at the Durable Object boundary. The underlying
          // SQLite work is local, but the commit pipeline runs through Effect
          // and may gain async boundaries over time. This keeps ordering
          // explicit without introducing a custom in-memory queue yet.
          runSerialized: true,
        }),
    ),
    Match.tag(
      "Connect",
      (message) =>
        new ExecutionPlan({
          effect: handleConnect(message),
          runSerialized: false,
        }),
    ),
    Match.exhaustive,
  );
}

const handleConnect = Effect.fn("GraphSyncProtocol.handleConnect")(function* (
  message: Messages.Connect,
) {
  // `lastCommitSeq` is the client's derived contiguous prefix cursor from the
  // ADR. We replay everything strictly after it, or just acknowledge that the
  // client is already caught up.
  //
  // TODO(graph-sync): Validate `message.graphId` against the graph identity
  // selected by the router / Durable Object binding. Right now the routed DO
  // chooses the graph, but this field is otherwise ignored on the server.
  const maxCommitSeq = yield* Repo.getLastCommitSeq();
  const events = yield* Repo.getEventsBetweenSeq({
    afterSeq: message.lastCommitSeq,
    upToCommitSeq: maxCommitSeq,
  });

  return createReplayOrDoneResponsePlan(events, maxCommitSeq);
});

const handleCommit = Effect.fn("GraphSyncProtocol.handleCommit")(function* (
  message: Messages.Commit,
) {
  const maxCommitSeq = yield* Repo.getLastCommitSeq();

  if (message.baseCommitSeq > maxCommitSeq) {
    return yield* new Errors.ProtocolViolationError({
      reason: "Client baseCommitSeq is ahead of server tip",
    });
  }

  if (message.baseCommitSeq < maxCommitSeq) {
    // Replay is always a suffix of the authoritative log starting just after
    // the client's last known contiguous commit.
    const missing = yield* Repo.getEventsBetweenSeq({
      afterSeq: message.baseCommitSeq,
      upToCommitSeq: maxCommitSeq,
    });

    return createReplayOrDoneResponsePlan(missing, maxCommitSeq);
  }

  if (message.events.length > MAX_EVENTS_PER_COMMIT) {
    return yield* new Errors.ProtocolViolationError({
      reason: `Commit exceeds max batch size of ${MAX_EVENTS_PER_COMMIT} events`,
    });
  }

  const committed = yield* Repo.insertEvents(message.events).pipe(
    Effect.catchTag("SqlError", (error) =>
      Effect.fail(remapCommitInsertSqlError(error)),
    ),
  );

  return new ResponsePlan({
    reply: [new Messages.CommitAck({ events: committed })],
    broadcast: [new Messages.Committed({ events: committed })],
  });
});

function createReplayOrDoneResponsePlan(
  events: ReadonlyArray<Messages.CommittedEvent>,
  upToCommitSeq: number,
) {
  // `Replay` is optional data; `ReplayDone` is the protocol boundary that tells
  // the client the catch-up cycle is complete and which tip it reached.
  if (Array.isNonEmptyReadonlyArray(events)) {
    return new ResponsePlan({
      reply: [
        new Messages.Replay({ events }),
        new Messages.ReplayDone({ upToCommitSeq }),
      ],
      broadcast: [],
    });
  }

  return new ResponsePlan({
    reply: [new Messages.ReplayDone({ upToCommitSeq })],
    broadcast: [],
  });
}

//
// Helpers
//

function remapCommitInsertSqlError(error: SqlError.SqlError) {
  // TODO: This should catch the sqlite unique-index failure for `events.id`,
  // but we have not verified that the driver consistently exposes the error
  // message in `cause` yet. Keep this path covered by follow-up testing.
  if (isEventIdUniquenessSqlError(error.cause)) {
    return new Errors.ProtocolViolationError({
      reason: "Commit contains an already-committed event id",
    });
  }

  return error;
}

function isEventIdUniquenessSqlError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("events.id")
  );
}
