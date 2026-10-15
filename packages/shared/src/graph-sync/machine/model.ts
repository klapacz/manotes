/**
 * Defines the graph sync machine's inputs, states, and write type.
 */
import { Socket } from "effect/socket";
import { Data, Effect } from "effect";
import { GraphSyncMessages } from "../contract/messages";

export type Input = Data.TaggedEnum<{
  SocketOpened: {};
  PendingEvents: {};
  ServerMessage: { message: GraphSyncMessages.ServerMessage };
}>;

export const Input = Data.taggedEnum<Input>();

export type State = Data.TaggedEnum<{
  Bootstrapping: { bufferedCommitted: ReadonlyArray<GraphSyncMessages.Committed> };
  Ready: {};
  Committing: { bufferedCommitted: ReadonlyArray<GraphSyncMessages.Committed> };
}>;

export const State = Data.taggedEnum<State>();

export type Write = (
  chunk: Uint8Array | string | Socket.CloseEvent,
) => Effect.Effect<void, Socket.SocketError>;

export * as GraphSyncModel from "./model";
