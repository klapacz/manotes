import { Context, type Effect, type Option } from "effect";
import type { GraphSyncMessages } from "./contract/messages";

export class Handler extends Context.Service<
  Handler,
  {
    readonly handle: (
      request: GraphSyncMessages.RelayRequest,
    ) => Effect.Effect<Option.Option<string>>;
  }
>()("GraphSyncRelay.Handler") {}

export * as GraphSyncRelay from "./relay";
