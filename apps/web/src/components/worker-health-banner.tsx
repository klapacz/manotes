import { Effect, Match, Stream } from "effect";
import { Show } from "solid-js";
import { createRuntimeStreamStore } from "../lib";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { DedicatedWorkerHealth } from "../lib/graph.worker-rpc";
import { cx } from "../lib/cva";

export function WorkerHealthBanner() {
  const health = createRuntimeStreamStore(
    () =>
      GraphWorkerClient.Service.pipe(
        Effect.map((svc) => svc.client.healthStream({})),
        Stream.unwrap,
      ),
    new DedicatedWorkerHealth({
      status: "down",
      consecutiveFailures: 0,
      lastFailure: "",
    }),
  );

  return (
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
  );
}
