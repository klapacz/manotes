/**
 * Declares runtime capabilities the graph sync machine depends on.
 */
import { Effect, Schema, Context } from "effect";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";
import * as Socket from "effect/unstable/socket/Socket";

export class GraphSyncMachineContext extends Context.Service<
  GraphSyncMachineContext,
  {
    readonly write: (
      message: Messages.ClientMessage,
    ) => Effect.Effect<void, Socket.SocketError | Schema.SchemaError, never>;
  }
>()("GraphSyncMachineContext") {}
