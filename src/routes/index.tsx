import { createFileRoute, Link } from "@tanstack/solid-router";
import * as LocalRegistry from "../lib/local-registry";
import { For, Show } from "solid-js";
import { buttonVariants } from "../components/ui/button";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const graphs = LocalRegistry.Runtime.createStreamStore(
    () => LocalRegistry.Repo.reactiveListGraph(),
    [] as LocalRegistry.Schema.Record[],
  );

  const graphOriginLabel = (origin: LocalRegistry.Schema.Record["origin"]) => {
    if (origin === "cloud") {
      return "synced";
    }

    return "local";
  };

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Manotes</h1>
        <p class="text-fg-subtle">Choose a graph or create a new one.</p>
      </header>

      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium uppercase tracking-wide text-fg-subtle">
          Local Graphs
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
              </Link>
            )}
          </For>
        </div>
      </Show>
    </main>
  );
}
