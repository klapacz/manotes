import { createFileRoute, Link } from "@tanstack/solid-router";
import * as LocalRegistry from "../lib/local-registry";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { For, Show, createMemo } from "solid-js";
import { buttonVariants } from "../components/ui/button";
import * as RemoteGraphRegistry from "../lib/remote-graph-registry";
import { useNavigate } from "@tanstack/solid-router";
import { Exit, Cause, Option, Boolean } from "effect";
import { constant } from "effect/Function";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const graphs = LocalRegistry.Runtime.createStreamStore(
    () => LocalRegistry.Repo.reactiveListGraph(),
    [] as LocalRegistry.Schema.Record[],
  );

  const cloudGraphsQuery = useQuery(() => ({
    queryKey: ["remote-graphs"],
    queryFn: RemoteGraphRegistry.listGraphs,
  }));

  const cloudGraphIdsOnDevice = createMemo(
    () =>
      new Set(
        graphs
          .map((graph) => graph.graphId)
          .filter((graphId) => graphId !== null),
      ),
  );

  const cloudGraphsNotOnDevice = createMemo(() =>
    (cloudGraphsQuery.data ?? []).filter(
      (graph) => !cloudGraphIdsOnDevice().has(graph.graphId),
    ),
  );

  const openCloudGraphMutation = useMutation(() => ({
    async mutationFn(graph: RemoteGraphRegistry.Graph) {
      const exit = await LocalRegistry.Runtime.runtime.runPromiseExit(
        LocalRegistry.Repo.createCloudGraph({
          graphId: graph.graphId,
          displayName: graph.displayName,
          graphKeyEnvelope: graph.graphKeyEnvelope,
        }),
      );

      if (Exit.isSuccess(exit)) {
        return navigate({
          to: "/$graph",
          params: { graph: exit.value.localGraphId },
        });
      }

      const isDisplayNameTakenError = Cause.failureOption(exit.cause).pipe(
        Option.map(
          (failure) => failure._tag === "LocalRegistry.DisplayNameTakenError",
        ),
        Option.getOrElse(constant(false)),
      );

      throw new Error(
        Boolean.match(isDisplayNameTakenError, {
          onTrue: constant(
            "A graph with that name already exists on this device.",
          ),
          onFalse: constant("Failed to open graph."),
        }),
      );
    },
  }));

  const graphOriginLabel = (origin: LocalRegistry.Schema.Record["origin"]) => {
    if (origin === "cloud") return "synced";
    return "local";
  };

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Manotes</h1>
        <p class="text-fg-subtle">
          Choose a graph, open one from the cloud, or create a new one.
        </p>
      </header>

      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium uppercase tracking-wide text-fg-subtle">
          On This Device
        </h2>
        <Link to="/create" class={buttonVariants({ variant: "outline" })}>
          New graph
        </Link>
      </div>

      <Show
        when={graphs.length > 0}
        fallback={
          <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
            No graphs yet.
          </div>
        }
      >
        <div class="space-y-3">
          <For each={graphs}>
            {(graph) => (
              <Link
                to="/$graph"
                params={{ graph: graph.localGraphId }}
                class="flex items-center justify-between rounded-xl border border-border px-4 py-3 transition-colors hover:bg-bg-subtle"
              >
                <span class="font-medium">{graph.displayName}</span>
                <span class="text-xs uppercase tracking-wide text-fg-subtle">
                  {graphOriginLabel(graph.origin)}
                </span>
              </Link>
            )}
          </For>
        </div>
      </Show>

      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium uppercase tracking-wide text-fg-subtle">
            Cloud Graphs
          </h2>
        </div>

        <Show when={cloudGraphsQuery.isPending}>
          <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
            Loading cloud graphs...
          </div>
        </Show>

        <Show
          when={!cloudGraphsQuery.isPending && cloudGraphsQuery.isError}
          fallback={
            <Show when={!cloudGraphsQuery.isPending}>
              <Show
                when={cloudGraphsNotOnDevice().length > 0}
                fallback={
                  <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
                    No cloud graphs to open.
                  </div>
                }
              >
                <div class="space-y-3">
                  <For each={cloudGraphsNotOnDevice()}>
                    {(graph) => (
                      <button
                        type="button"
                        class="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-bg-subtle"
                        onClick={() => openCloudGraphMutation.mutate(graph)}
                        disabled={openCloudGraphMutation.isPending}
                      >
                        <span class="font-medium">{graph.displayName}</span>
                        <span class="text-xs uppercase tracking-wide text-fg-subtle">
                          Open
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          }
        >
          <div class="rounded-xl border border-dashed border-border p-6 text-sm text-warning-fg-subtle">
            Failed to load cloud graphs.
          </div>
        </Show>

        <Show when={openCloudGraphMutation.isError}>
          <p class="text-sm text-error-fg" role="alert">
            {openCloudGraphMutation.error?.message ?? "Failed to open graph."}
          </p>
        </Show>
      </section>
    </main>
  );
}
