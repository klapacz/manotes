import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { createEffect, For } from "solid-js";
import { Effect, Array, pipe, Option, Stream } from "effect";
import { useAtomValue, useAtom } from "@effect/atom-solid";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { List, ListItem } from "../components/ui/list";
import { MatchAsyncResult, MatchTag, createAtomStore } from "../lib";
import * as GraphAccessCommands from "../lib/graph-access/commands";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as RemoteRegistryService from "../lib/graph-access/remote-registry/service";
import * as SessionAtom from "../lib/graph-access/session/atom";
import { GraphListItem } from "./-index/GraphListItem";
import { WaitlistDialog } from "./-index/waitlist-dialog";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

const localGraphsAtom = GraphAccessRuntime.atom.atom(
  Effect.fnUntraced(function* (ctx) {
    const session = yield* ctx.result(SessionAtom.find);
    return LocalRegistry.Repo.reactiveListGraph({
      accountId: session.pipe(Option.map((s) => s.accountId)),
    });
  }, Stream.unwrap),
);
const cloudGraphsAtom = RemoteRegistryService.Service.listGraphs;

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

function RouteComponent() {
  const localGraphs = createAtomStore(() => localGraphsAtom, [] as LocalRegistry.Schema.Record[]);
  const session = useAtomValue(() => SessionAtom.find);

  return (
    <main class="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Manotes</h1>
        <p class="text-fg-subtle">
          <MatchAsyncResult
            when={session()}
            onSuccess={(sessionOption) => (
              <MatchTag
                when={sessionOption()}
                cases={{
                  Some: () => "Choose a graph, open one from the cloud, or create a new one.",
                  None: () => "Open a graph or create a new one.",
                }}
              />
            )}
            fallback="Open a graph or create a new one."
          />
        </p>

        <MatchAsyncResult
          when={session()}
          onSuccess={(session) => (
            <MatchTag
              when={session()}
              cases={{
                Some: (session) => (
                  <p class="text-sm text-fg-subtle">
                    Signed in as <span class="font-medium">{session().value.email}</span>
                  </p>
                ),
                None: () => (
                  <p class="text-sm text-fg-subtle">
                    <WaitlistDialog class="underline cursor-pointer">
                      Sign in or join the waitlist
                    </WaitlistDialog>
                  </p>
                ),
              }}
            />
          )}
          onInitial={() => <p class="text-sm text-fg-subtle">Checking sign-in status...</p>}
          onFailure={(error) => {
            createEffect(() => console.log(error()));
            return <p class="text-sm text-fg-subtle">Failed to load sign-in status.</p>;
          }}
        />
      </header>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardHeader class="p-0">
            <CardTitle>On This Device</CardTitle>
            <CardDescription>Graphs on this device.</CardDescription>
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

        <List>
          <For
            each={localGraphs}
            fallback={
              <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
                No graphs yet.
              </ListItem>
            }
          >
            {(graph) => <GraphListItem graph={graph} />}
          </For>
        </List>
      </section>

      <MatchAsyncResult
        when={session()}
        onSuccess={(sessionOption) => (
          <MatchTag
            when={sessionOption()}
            cases={{
              Some: () => <CloudGraphsSection />,
              None: () => null,
            }}
          />
        )}
      />
    </main>
  );
}

function CloudGraphsSection() {
  const cloudGraphsNotOnDevice = useAtomValue(() => cloudGraphsNotOnDeviceAtom);
  const [openCloudGraphResult, openCloudGraph] = useAtom(
    () => GraphAccessCommands.Atom.openCloudOnDevice,
  );

  return (
    <section class="space-y-4">
      <CardHeader class="p-0">
        <CardTitle>Cloud Graphs</CardTitle>
        <CardDescription>
          Open synced graphs that exist in your account but not on this device yet.
        </CardDescription>
      </CardHeader>

      <MatchAsyncResult
        when={openCloudGraphResult()}
        onSuccess={(graph) => <Navigate to="/$graph" params={{ graph: graph().localGraphId }} />}
        onError={(error) => (
          <Alert variant="destructive">
            <AlertDescription>
              <MatchTag
                when={error()}
                fallback="Failed to open graph."
                cases={{
                  "LocalRegistry.DisplayNameTakenError": () =>
                    "A graph with that name already exists on this device.",
                }}
              />
            </AlertDescription>
          </Alert>
        )}
        onDefect={() => (
          <Alert variant="destructive">
            <AlertDescription>Failed to open graph.</AlertDescription>
          </Alert>
        )}
      />

      <MatchAsyncResult
        when={cloudGraphsNotOnDevice()}
        onSuccess={(graphs) => (
          <List>
            <For
              each={graphs()}
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
                    onClick={() => openCloudGraph({ graph })}
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
        )}
        onFailure={() => (
          <Alert variant="warning">
            <AlertDescription>Failed to load cloud graphs.</AlertDescription>
          </Alert>
        )}
        onInitial={() => (
          <List>
            <ListItem dashed class="px-4 py-3 text-sm text-fg-subtle">
              Loading cloud graphs...
            </ListItem>
          </List>
        )}
      />
    </section>
  );
}
