/**
 * Declares runtime capabilities the graph sync machine depends on.
 */
import { Context, Effect } from "effect";
import * as Messages from "../contract/messages";
import * as Socket from "@effect/platform/Socket";
import type { ParseError } from "effect/ParseResult";

export class GraphSyncMachineContext extends Context.Tag(
  "GraphSyncMachineContext",
)<
  GraphSyncMachineContext,
  {
    readonly write: (
      message: Messages.ClientMessage,
    ) => Effect.Effect<void, Socket.SocketError | ParseError, never>;
  }
>() {}
