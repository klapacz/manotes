import { Schema } from "effect";

export class SyncStatusLocal extends Schema.Class<SyncStatusLocal>("SyncStatusLocal")({
  mode: Schema.Literals(["local"]),
}) {}

export class SyncStatusCloud extends Schema.Class<SyncStatusCloud>("SyncStatusCloud")({
  mode: Schema.Literals(["cloud"]),
  syncState: Schema.Literals([
    // Not connected, or socket closed after opening. Will retry.
    "Disconnected",
    // Socket open failed (network, auth, server down). Will retry.
    "Failed",
    "Bootstrapping",
    "Ready",
    "Committing",
  ]),
  hasPending: Schema.Boolean,
}) {}

export const SyncStatus = Schema.Union([SyncStatusLocal, SyncStatusCloud]);

export type SyncStatus = typeof SyncStatus.Type;
