import { Match, Stream } from "effect";
import { Show } from "solid-js";
import { bindRt, createAtomStore } from "../lib";
import { sampleLatest } from "../lib/primitives/stream/sample-latest";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { DedicatedWorkerHealth } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

const initialHealth = new DedicatedWorkerHealth({
  status: "down",
  consecutiveFailures: 0,
  lastFailure: "",
});
const WorkerHealth = bindRt((rt) =>
  rt.atom(
    GraphWorkerClient.Service.useSync((svc) => svc.client.healthStream({})).pipe(
      Stream.unwrap,
      sampleLatest("1 second"),
    ),
  ),
);

export function WorkerHealthBanner() {
  const health = createAtomStore(WorkerHealth, initialHealth);

  return (
    <Show when={health.value.status !== "healthy"}>
      <div
        class={cx(
          "rounded-md border px-3 py-2 text-xs",
          Match.value(health.value.status).pipe(
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
        Worker {health.value.status}
        <Show when={health.value.lastFailure}>{`: ${health.value.lastFailure}`}</Show>
      </div>
    </Show>
  );
}
