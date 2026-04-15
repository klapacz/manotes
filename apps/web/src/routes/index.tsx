import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { For } from "solid-js";
import { Effect, Array, pipe } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useAtomValue, useAtom } from "@effect/atom-solid";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { List, ListItem } from "../components/ui/list";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as RemoteRegistryClient from "../lib/graph-access/remote-registry/client";
import * as Session from "../lib/graph-access/session";
import type { FnContext } from "effect/unstable/reactivity/Atom";
import { GraphListItem } from "./-index/GraphListItem";
import { CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

// TODO: These atoms cache one-shot reads and are not refreshed after upload/open mutations,
// so the home screen can keep showing stale local/cloud graph lists until reload.
const localGraphsAtom = GraphAccessRuntime.atom.atom(LocalRegistry.Repo.listGraphs);
const cloudGraphsAtom = GraphAccessRuntime.atom.atom(
  Effect.fnUntraced(function* (get) {
    const client = yield* get.result(RemoteRegistryClient.atom);
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
  Effect.fnUntraced(function* (graph: RemoteRegistryClient.Graph, get: FnContext) {
    const session = yield* get.result(Session.atom);

    return yield* LocalRegistry.Repo.createCloudGraph({
      graphId: graph.graphId,
      displayName: graph.displayName,
      graphKeyEnvelope: graph.graphKeyEnvelope,
      accountId: session.accountId,
    });
  }),
);

function RouteComponent() {
  const localGraphs = useAtomValue(localGraphsAtom);
  const cloudGraphsNotOnDevice = useAtomValue(cloudGraphsNotOnDeviceAtom);
  const [openCloudGraphResult, openCloudGraph] = useAtom(openCloudGraphAtom);

  return (
    <main class="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Manotes</h1>
        <p class="text-fg-subtle">Choose a graph, open one from the cloud, or create a new one.</p>
      </header>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardHeader class="p-0">
            <CardTitle>On This Device</CardTitle>
            <CardDescription>
              Open local graphs or synced graphs already available here.
            </CardDescription>
          </CardHeader>

          <div class="flex flex-wrap gap-3">
            <Link to="/import" class={buttonVariants({ variant: "outline", size: "sm" })}>
              Import backup
            </Link>
            <Link to="/create" class={buttonVariants({ variant: "outline", size: "sm" })}>
              New graph
            </Link>
          </div>
        </div>

        {AsyncResult.match(localGraphs(), {
          onSuccess: (graphs) => (
            <List>
              <For
                each={graphs.value}
                fallback={
                  <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
                    No graphs yet.
                  </ListItem>
                }
              >
                {(graph) => <GraphListItem graph={graph} />}
              </For>
            </List>
          ),
          onFailure: () => (
            <Alert variant="warning">
              <AlertDescription>Failed to load graphs.</AlertDescription>
            </Alert>
          ),
          onInitial: () => (
            <List>
              <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
                Loading graphs...
              </ListItem>
            </List>
          ),
        })}

        {AsyncResult.matchWithError(openCloudGraphResult(), {
          onInitial: () => null,
          onSuccess: (graph) => (
            <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
          ),
          onError: (error) => (
            <Alert variant="destructive">
              <AlertDescription>
                {error._tag === "LocalRegistry.DisplayNameTakenError"
                  ? "A graph with that name already exists on this device."
                  : "Failed to open graph."}
              </AlertDescription>
            </Alert>
          ),
          onDefect: () => (
            <Alert variant="destructive">
              <AlertDescription>Failed to open graph.</AlertDescription>
            </Alert>
          ),
        })}
      </section>

      <section class="space-y-4">
        <CardHeader class="p-0">
          <CardTitle>Cloud Graphs</CardTitle>
          <CardDescription>
            Open synced graphs that exist in your account but not on this device yet.
          </CardDescription>
        </CardHeader>

        {AsyncResult.match(cloudGraphsNotOnDevice(), {
          onSuccess: (graphs) => (
            <List>
              <For
                each={graphs.value}
                fallback={
                  <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
                    No cloud graphs to open.
                  </ListItem>
                }
              >
                {(graph) => (
                  <ListItem interactive>
                    <Button
                      type="button"
                      variant="plain"
                      class="h-auto w-full justify-between rounded-xl px-4 py-3 text-left"
                      onClick={() => openCloudGraph(graph)}
                      disabled={openCloudGraphResult().waiting}
                    >
                      <span class="min-w-0">
                        <span class="block truncate font-medium">{graph.displayName}</span>
                      </span>
                      <span class="flex items-center gap-3">
                        <Badge variant="secondary" class="uppercase tracking-wide">
                          synced
                        </Badge>
                        <span class="text-xs uppercase tracking-wide text-fg-subtle">Open</span>
                      </span>
                    </Button>
                  </ListItem>
                )}
              </For>
            </List>
          ),
          onFailure: () => (
            <Alert variant="warning">
              <AlertDescription>Failed to load cloud graphs.</AlertDescription>
            </Alert>
          ),
          onInitial: () => (
            <List>
              <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
                Loading cloud graphs...
              </ListItem>
            </List>
          ),
        })}
      </section>
    </main>
  );
}
