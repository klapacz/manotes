import { Context, SubscriptionRef } from "effect";
import type { SyncStatusCloud } from "../graph.worker-rpc";

export class Ref extends Context.Service<Ref, SubscriptionRef.SubscriptionRef<SyncStatusCloud>>()(
  "GraphSyncStatus.Ref",
) {}
