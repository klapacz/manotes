import { ServiceMap, SubscriptionRef } from "effect";
import type { SyncStatusCloud } from "../graph.worker-rpc";

export class Ref extends ServiceMap.Service<
  Ref,
  SubscriptionRef.SubscriptionRef<SyncStatusCloud>
>()("GraphSyncStatus.Ref") {}
