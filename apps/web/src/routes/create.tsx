import { useAtom } from "@effect/atom-solid";
import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { Effect } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import { createSignal } from "solid-js";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import { Button, buttonVariants } from "../components/ui/button";
import { Runtime } from "../lib";
import * as Session from "../lib/graph-access/session";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { Show } from "solid-js";
import type { FnContext } from "effect/unstable/reactivity/Atom";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

type CreateGraphInput = {
  mode: "cloud" | "local";
  displayName: string;
  password: string;
};

const createGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* ({ mode, displayName, password }: CreateGraphInput, get: FnContext) {
    if (mode === "local") {
      return yield* LocalRegistry.Repo.createGraph(displayName);
    }

    const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
    const session = yield* get.result(Session.atom);
    const client = yield* RpcClient.make(GraphRegistryRpc);
    const graph = yield* client.createGraph({
      displayName,
      graphKeyEnvelope: wrapped.envelope,
    });
    const localGraph = yield* LocalRegistry.Repo.createCloudGraph({
      graphId: graph.graphId,
      displayName: graph.displayName,
      graphKeyEnvelope: graph.graphKeyEnvelope,
      accountId: session.accountId,
    });

    yield* Effect.tryPromise(() =>
      Runtime.setup({
        localGraphId: localGraph.localGraphId,
        displayName: localGraph.displayName,
        graphSyncConfig: {
          mode: "cloud",
          graphId: graph.graphId,
          graphKey: wrapped.graphKey,
        },
      }),
    );

    return localGraph;
  }),
);

function RouteComponent() {
  const [displayName, setDisplayName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [createGraphResult, createGraph] = useAtom(createGraphAtom);

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();

    const trimmedName = displayName().trim();
    if (!trimmedName) {
      setValidationError("Graph name is required.");
      return;
    }

    const submitter = event.submitter;
    let mode: "local" | "cloud" = "local";

    if (submitter instanceof HTMLButtonElement && submitter.dataset.mode === "cloud") {
      mode = "cloud";
    }

    const normalizedPassword = GraphEncryption.normalizePassword(password());

    if (mode === "cloud" && !normalizedPassword) {
      setValidationError("Password is required for synced graphs.");
      return;
    }

    setValidationError(null);
    createGraph({
      mode,
      displayName: trimmedName,
      password: normalizedPassword,
    });
  }

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Create graph</h1>
        <p class="text-fg-subtle">Name your graph and choose whether it stays local or syncs.</p>
      </header>

      <form class="space-y-4" onSubmit={handleSubmit}>
        <label class="block space-y-2">
          <span class="text-sm font-medium">Graph name</span>
          <input
            value={displayName()}
            onInput={(event) => setDisplayName(event.currentTarget.value)}
            class="w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none"
            placeholder="work"
            autofocus
          />
        </label>

        <label class="block space-y-2">
          <span class="text-sm font-medium">Password for synced graphs</span>
          <input
            type="password"
            value={password()}
            onInput={(event) => setPassword(event.currentTarget.value)}
            class="w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none"
            placeholder="Required only for synced graphs"
          />
        </label>

        <Show when={validationError()}>
          {(error) => (
            <p class="text-sm text-error-fg" role="alert">
              {error()}
            </p>
          )}
        </Show>

        {AsyncResult.matchWithError(createGraphResult(), {
          onInitial: () => null,
          onSuccess: (graph) => (
            <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
          ),
          onError: (error) => (
            <p class="text-sm text-error-fg" role="alert">
              {error._tag == "LocalRegistry.DisplayNameTakenError"
                ? "A graph with that name already exists."
                : error._tag == "GraphRegistry.DisplayNameTakenError"
                  ? "A synced graph with that name already exists."
                  : "Failed to create graph."}
            </p>
          ),
          onDefect: () => (
            <p class="text-sm text-error-fg" role="alert">
              Failed to create graph.
            </p>
          ),
        })}

        <div class="flex gap-3">
          <Button type="submit" data-mode="local" disabled={createGraphResult().waiting}>
            Create local graph
          </Button>
          <Button
            type="submit"
            variant="outline"
            data-mode="cloud"
            disabled={createGraphResult().waiting}
          >
            Create synced graph
          </Button>
          <Link to="/" class={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
