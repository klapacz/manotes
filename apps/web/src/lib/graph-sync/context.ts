import { ServiceMap } from "effect";

export class Context extends ServiceMap.Service<
  Context,
  {
    readonly graphId: string;
    readonly graphKey: Uint8Array;
  }
>()("GraphSync.Context") {}
