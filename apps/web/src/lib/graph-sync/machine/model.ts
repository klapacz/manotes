/**
 * Defines the graph sync machine's inputs, states, and write type.
 */
import { Socket } from "effect/unstable/socket";
import { Data, Effect } from "effect";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";

export type Input = Data.TaggedEnum<{
  SocketOpened: {};
  PendingEvents: {};
  ServerMessage: { message: Messages.ServerMessage };
  SocketClosed: {};
}>;

export const Input = Data.taggedEnum<Input>();

export type State = Data.TaggedEnum<{
  Bootstrapping: { bufferedCommitted: ReadonlyArray<Messages.Committed> };
  Ready: {};
  Committing: { bufferedCommitted: ReadonlyArray<Messages.Committed> };
}>;

export const State = Data.taggedEnum<State>();

export type Write = (
  chunk: Uint8Array | string | Socket.CloseEvent,
) => Effect.Effect<void, Socket.SocketError>;
