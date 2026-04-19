import { Match, Stream } from "effect";
import { Show } from "solid-js";
import { bindRt, createAtomStore } from "../lib";
import { sampleLatest } from "../lib/primitives/stream/sample-latest";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { SyncStatusLocal } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialStatus = new SyncStatusLocal({ mode: "local" });

const SyncStatus = bindRt((rt) =>
  rt.atom(
    GraphWorkerClient.Service.useSync((svc) => svc.client.syncStatusStream({})).pipe(
      Stream.unwrap,
      sampleLatest("1 second"),
    ),
  ),
);

export function SyncStatusIndicator() {
  const status = createAtomStore(SyncStatus, initialStatus);

  return (
    <Show when={status.mode === "cloud" && status.syncState !== "Ready" ? status : null}>
      {(cloud) => (
        <div
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
