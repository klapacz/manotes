import { Context as C } from "effect";

export class Context extends C.Service<
  Context,
  {
    readonly graphId: string;
    readonly graphKey: Uint8Array;
  }
>()("GraphSync.Context") {}
