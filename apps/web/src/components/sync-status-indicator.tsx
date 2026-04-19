import { Array, Option, Match, Stream } from "effect";
import { Show } from "solid-js";
import { bindRt, createAtomStore } from "../lib";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { SyncStatusLocal } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialStatus = new SyncStatusLocal({ mode: "local" });
const displayWindow = "1 second";
const displayWindowChunkSize = 10_000;

// Sample the latest sync status once per short time window instead of waiting
// for the stream to go quiet. This avoids flicker from very short-lived states
// like brief disconnects, while still showing progress during long bursts of
// rapid updates where `Stream.debounce()` could suppress output indefinitely.
const SyncStatus = bindRt((rt) =>
  rt.atom(
    GraphWorkerClient.Service.useSync((svc) => svc.client.syncStatusStream({})).pipe(
      Stream.unwrap,
      Stream.groupedWithin(displayWindowChunkSize, displayWindow),
      Stream.map(Array.last),
      Stream.filter(Option.isSome),
      Stream.map((option) => option.value),
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
