import { Context as EffectContext } from "effect";

export class Context extends EffectContext.Tag("GraphSync.Context")<
  Context,
  {
    readonly graphId: string;
  }
>() {}
