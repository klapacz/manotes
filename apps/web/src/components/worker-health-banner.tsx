import { Match, Stream } from "effect";
import { Show } from "solid-js";
import { RtAtom } from "../lib";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { DedicatedWorkerHealth } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialHealth = new DedicatedWorkerHealth({
  status: "down",
  consecutiveFailures: 0,
  lastFailure: "",
});
const WorkerHealth = RtAtom.atom(
  GraphWorkerClient.Service.useSync((svc) => svc.client.healthStream({})).pipe(Stream.unwrap),
);

export function WorkerHealthBanner() {
  const health = RtAtom.useStore(WorkerHealth, initialHealth);

  return (
    <Show when={health.status !== "healthy"}>
      <div
        class={cx(
          "rounded-md border px-3 py-2 text-xs",
          Match.value(health.status).pipe(
            Match.when(
              "healthy",
              () => "bg-success-bg-subtle border-success-border text-success-fg-subtle",
            ),
            Match.whenOr(
              "degraded",
              "down",
              () => "bg-warning-bg-subtle border-warning-border text-warning-fg-subtle",
            ),
            Match.exhaustive,
          ),
        )}
      >
        Worker {health.status}
        <Show when={health.lastFailure}>{`: ${health.lastFailure}`}</Show>
      </div>
    </Show>
  );
}
