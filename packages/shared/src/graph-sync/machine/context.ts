/**
 * Declares runtime capabilities the graph sync machine depends on.
 */
import { Effect, Schema, Context } from "effect";
import { GraphSyncMessages } from "../contract/messages";
import { Socket } from "effect/socket";

export class GraphSyncMachineContext extends Context.Service<
  GraphSyncMachineContext,
  {
    readonly write: (
      message: GraphSyncMessages.ClientMessage,
    ) => Effect.Effect<void, Socket.SocketError | Schema.SchemaError, never>;
  }
>()("GraphSyncMachineContext") {}

export * as MachineContext from "./context";
