import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import { For } from "solid-js";
import { buttonVariants } from "../components/ui/button";
import * as RemoteRegistryRpc from "../lib/graph-access/remote-registry/rpc";
import * as Session from "../lib/graph-access/session";
import { Effect, Array, pipe, Match } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useAtomValue, useAtom } from "@effect/atom-solid";
import { RpcClient } from "effect/unstable/rpc";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import type { FnContext } from "effect/unstable/reactivity/Atom";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

const localGraphsAtom = GraphAccessRuntime.atom.atom(LocalRegistry.Repo.listGraphs);
const cloudGraphsAtom = GraphAccessRuntime.atom.atom(
  Effect.gen(function* () {
    const client = yield* RpcClient.make(GraphRegistryRpc);
    return yield* client.listGraphs();
  }),
);

const cloudGraphsNotOnDeviceAtom = GraphAccessRuntime.atom.atom(
  Effect.fnUntraced(function* (ctx) {
    const [localGraphs, cloudGraphs] = yield* Effect.all([
      ctx.result(localGraphsAtom),
      ctx.result(cloudGraphsAtom),
    ]);

    const localGraphIds = pipe(
      localGraphs,
      Array.filter((graph) => graph.graphId !== null),
      Array.map((graph) => graph.graphId),
    );

    return Array.filter(cloudGraphs, (graph) => !localGraphIds.includes(graph.graphId));
  }),
);

const openCloudGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* (graph: RemoteRegistryRpc.Graph, get: FnContext) {
    const session = yield* get.result(Session.atom);

    return yield* LocalRegistry.Repo.createCloudGraph({
      graphId: graph.graphId,
      displayName: graph.displayName,
      graphKeyEnvelope: graph.graphKeyEnvelope,
      accountId: session.accountId,
    });
  }),
);

const graphModeLabel = Match.type<LocalRegistry.Schema.Record["mode"]>().pipe(
  Match.when("cloud", () => "synced"),
  Match.when("local", () => "local"),
  Match.exhaustive,
);

function RouteComponent() {
  const localGraphs = useAtomValue(localGraphsAtom);
  const cloudGraphsNotOnDevice = useAtomValue(cloudGraphsNotOnDeviceAtom);
  const [openCloudGraphResult, openCloudGraph] = useAtom(openCloudGraphAtom);

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Manotes</h1>
        <p class="text-fg-subtle">Choose a graph, open one from the cloud, or create a new one.</p>
      </header>

      <div class="flex items-center justify-between">
        <h2 class="text-sm font-medium uppercase tracking-wide text-fg-subtle">On This Device</h2>
        <div class="flex gap-3">
          <Link to="/import" class={buttonVariants({ variant: "outline" })}>
            Import backup
          </Link>
          <Link to="/create" class={buttonVariants({ variant: "outline" })}>
            New graph
          </Link>
        </div>
      </div>

      {AsyncResult.match(localGraphs(), {
        onSuccess: (graphs) => (
          <div class="space-y-3">
            <For
              each={graphs.value}
              fallback={
                <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
                  No graphs yet.
                </div>
              }
            >
              {(graph) => (
                <Link
                  to="/$graph"
                  params={{ graph: graph.localGraphId }}
                  class="flex items-center justify-between rounded-xl border border-border px-4 py-3 transition-colors hover:bg-bg-subtle"
                >
                  <span class="font-medium">{graph.displayName}</span>
                  <span class="text-xs uppercase tracking-wide text-fg-subtle">
                    {graphModeLabel(graph.mode)}
                  </span>
                </Link>
              )}
            </For>
          </div>
        ),
        onFailure: () => (
          <div class="rounded-xl border border-dashed border-border p-6 text-sm text-warning-fg-subtle">
            Failed to load graphs.
          </div>
        ),
        onInitial: () => (
          <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
            Loading graphs...
          </div>
        ),
      })}

      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-medium uppercase tracking-wide text-fg-subtle">Cloud Graphs</h2>
        </div>

        {AsyncResult.match(cloudGraphsNotOnDevice(), {
          onSuccess: (graphs) => (
            <div class="space-y-3">
              <For
                each={graphs.value}
                fallback={
                  <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
                    No cloud graphs to open.
                  </div>
                }
              >
                {(graph) => (
                  <button
                    type="button"
                    class="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-bg-subtle"
                    onClick={() => openCloudGraph(graph)}
                    disabled={openCloudGraphResult().waiting}
                  >
                    <span class="font-medium">{graph.displayName}</span>
                    <span class="text-xs uppercase tracking-wide text-fg-subtle">Open</span>
                  </button>
                )}
              </For>
            </div>
          ),
          onFailure: () => (
            <div class="rounded-xl border border-dashed border-border p-6 text-sm text-warning-fg-subtle">
              Failed to load cloud graphs.
            </div>
          ),
          onInitial: () => (
            <div class="rounded-xl border border-dashed border-border p-6 text-sm text-fg-subtle">
              Loading cloud graphs...
            </div>
          ),
        })}

        {AsyncResult.matchWithError(openCloudGraphResult(), {
          onInitial: () => null,
          onSuccess: (graph) => (
            <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
          ),
          onError: (error) => (
            <p class="text-sm text-error-fg" role="alert">
              {error._tag === "LocalRegistry.DisplayNameTakenError"
                ? "A graph with that name already exists on this device."
                : "Failed to open graph."}
            </p>
          ),
          onDefect: () => (
            <p class="text-sm text-error-fg" role="alert">
              Failed to open graph.
            </p>
          ),
        })}
      </section>
    </main>
  );
}
