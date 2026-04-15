import { Match, Stream } from "effect";
import { Show } from "solid-js";
import { RtAtom } from "../lib";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { SyncStatusLocal } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialStatus = new SyncStatusLocal({ mode: "local" });
const SyncStatus = RtAtom.atom(
  GraphWorkerClient.Service.useSync((svc) => svc.client.syncStatusStream({})).pipe(
    Stream.unwrap,
    Stream.debounce("300 millis"),
  ),
);

export function SyncStatusIndicator() {
  const status = RtAtom.useStore(SyncStatus, initialStatus);

  return (
    <Show when={status.mode === "cloud" ? status : null}>
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
