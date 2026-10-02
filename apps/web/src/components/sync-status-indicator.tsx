import { Match, Stream } from "effect";
import { Show, createMemo } from "solid-js";
import { runStream } from "../lib/solid-effect";
import { sampleLatest } from "../lib/primitives/stream/sample-latest";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { SyncStatusLocal } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialStatus = new SyncStatusLocal({ mode: "local" });

const syncStatus = GraphWorkerClient.Service.useSync((svc) => svc.client.syncStatusStream({})).pipe(
  Stream.unwrap,
  sampleLatest("1 second"),
);

export function SyncStatusIndicator() {
  const status = createMemo(() => runStream(syncStatus), { loadingValue: initialStatus });

  const cloud = createMemo(() => {
    const current = status();

    return current.mode === "cloud" ? current : null;
  });

  // Keep the element mounted when Ready: scripts/enter.ts reads its sync attributes.
  return (
    <Show when={cloud()}>
      {(cloud) => (
        <div
          hidden={cloud().syncState === "Ready"}
          data-sync-state={cloud().syncState}
          data-sync-pending={String(cloud().hasPending)}
          class={cx(
            "rounded-md border px-3 py-2 text-xs",
            Match.value(cloud().syncState).pipe(
              Match.whenOr(
                "Ready",
                "Committing",
                () => "bg-success-bg-subtle border-success-border text-success-fg-subtle",
              ),
              Match.whenOr(
                "Bootstrapping",
                "Disconnected",
                "Failed",
                () => "bg-warning-bg-subtle border-warning-border text-warning-fg-subtle",
              ),
              Match.exhaustive,
            ),
          )}
        >
          Sync: {cloud().syncState}
          <Show when={cloud().hasPending}> &middot; pending changes</Show>
        </div>
      )}
    </Show>
  );
}
