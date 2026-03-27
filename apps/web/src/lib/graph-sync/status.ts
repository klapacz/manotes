import { Context, SubscriptionRef } from "effect";
import type { SyncStatusCloud } from "../graph.worker-rpc";

export class Ref extends Context.Tag("GraphSyncStatus.Ref")<
  Ref,
  SubscriptionRef.SubscriptionRef<SyncStatusCloud>
>() {}
