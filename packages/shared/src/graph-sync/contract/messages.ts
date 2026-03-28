/**
 * Defines the shared graph sync wire-message schemas and types.
 */
import { Schema } from "effect";

export class PendingEvent extends Schema.Class<PendingEvent>("GraphSyncPendingEvent")({
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8Array,
  // Opaque encrypted event-envelope bytes. The sync server stores and replays
  // them without interpreting note content.
  payload: Schema.Uint8Array,
  createdAt: Schema.DateTimeUtcFromString,
}) {
  declare private readonly _brand: void;
}

export class CommittedEvent extends Schema.Class<CommittedEvent>("GraphSyncCommittedEvent")({
  id: Schema.NonEmptyString,
  streamRef: Schema.Uint8Array,
  // Opaque encrypted event-envelope bytes. Clients decrypt them locally after
  // replay or commit acknowledgement.
  payload: Schema.Uint8Array,
  createdAt: Schema.DateTimeUtcFromString,
  commitSeq: Schema.Number.check(Schema.isGreaterThan(0)),
}) {
  declare private readonly _brand: void;
}

export class Connect extends Schema.TaggedClass<Connect>("manotes/graph-sync/Connect")("Connect", {
  graphId: Schema.NonEmptyString,
  lastCommitSeq: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class Commit extends Schema.TaggedClass<Commit>("manotes/graph-sync/Commit")("Commit", {
  baseCommitSeq: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  events: Schema.NonEmptyArray(PendingEvent),
}) {}

export class Replay extends Schema.TaggedClass<Replay>("manotes/graph-sync/Replay")("Replay", {
  events: Schema.NonEmptyArray(CommittedEvent),
}) {}

export class ReplayDone extends Schema.TaggedClass<ReplayDone>("manotes/graph-sync/ReplayDone")(
  "ReplayDone",
  {
    upToCommitSeq: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  },
) {}

export class CommitAck extends Schema.TaggedClass<CommitAck>("manotes/graph-sync/CommitAck")(
  "CommitAck",
  {
    events: Schema.NonEmptyArray(CommittedEvent),
  },
) {}

export class Committed extends Schema.TaggedClass<Committed>("manotes/graph-sync/Committed")(
  "Committed",
  {
    events: Schema.NonEmptyArray(CommittedEvent),
  },
) {}

export const ClientMessage = Schema.Union([Connect, Commit]);

export const ServerMessage = Schema.Union([Replay, ReplayDone, CommitAck, Committed]);

export type ClientMessage = typeof ClientMessage.Type;

export type ServerMessage = typeof ServerMessage.Type;
