import { useMutation } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Cause, Exit, Match, Option, Boolean } from "effect";
import { createSignal } from "solid-js";
import * as LocalRegistry from "../lib/local-registry";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { Runtime } from "../lib";
import { constant } from "effect/Function";
import { Button, buttonVariants } from "../components/ui/button";
import * as RemoteGraphRegistry from "../lib/remote-graph-registry";
import { DEFAULT_ACCOUNT_ID } from "../lib/constant";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const createGraphMutation = useMutation(() => ({
    async mutationFn({
      mode,
      displayName,
      password,
    }: {
      mode: "local" | "cloud";
      displayName: string;
      password: string;
    }) {
      const exit = await Match.value(mode).pipe(
        Match.when("local", () =>
          LocalRegistry.Runtime.runtime.runPromiseExit(LocalRegistry.Repo.createGraph(displayName)),
        ),
        Match.when("cloud", async () => {
          const wrapped = await GraphEncryption.createGraphKey(password);

          const graph = await RemoteGraphRegistry.createGraph({
            displayName,
            graphKeyEnvelope: wrapped.envelope,
          });

          const localGraphExit = await LocalRegistry.Runtime.runtime.runPromiseExit(
            LocalRegistry.Repo.createCloudGraph({
              graphId: graph.graphId,
              displayName: graph.displayName,
              graphKeyEnvelope: graph.graphKeyEnvelope,
              accountId: DEFAULT_ACCOUNT_ID,
            }),
          );

          if (Exit.isSuccess(localGraphExit)) {
            // @effect-diagnostics-next-line floatingEffect:off
            await Runtime.setup({
              localGraphId: localGraphExit.value.localGraphId,
              displayName: localGraphExit.value.displayName,
              graphSyncConfig: {
                mode: "cloud",
                graphId: graph.graphId,
                graphKey: wrapped.graphKey,
              },
            });
          }

          return localGraphExit;
        }),
        Match.exhaustive,
      );

      Exit.match(exit, {
        onFailure: (cause) => {
          const isDisplayNameTakenError = Cause.findErrorOption(cause).pipe(
            Option.map((failure) => failure._tag === "LocalRegistry.DisplayNameTakenError"),
            Option.getOrElse(constant(false)),
          );

          setError(
            Boolean.match(isDisplayNameTakenError, {
              onTrue: constant("A graph with that name already exists."),
              onFalse: constant("Failed to create graph."),
            }),
          );
        },
        onSuccess: (graph) => {
          void navigate({
            to: "/$graph",
            params: { graph: graph.localGraphId },
          });
        },
      });
    },
  }));

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();

    const trimmedName = displayName().trim();
    if (!trimmedName) {
      setError("Graph name is required.");
      return;
    }

    setError(null);
    const submitter = event.submitter;
    let mode: "local" | "cloud" = "local";

    if (submitter instanceof HTMLButtonElement && submitter.dataset.mode === "cloud") {
      mode = "cloud";
    }

    const normalizedPassword = GraphEncryption.normalizePassword(password());

    if (mode === "cloud" && !normalizedPassword) {
      setError("Password is required for synced graphs.");
      return;
    }

    createGraphMutation.mutate({
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

        {error() ? (
          <p class="text-sm text-error-fg" role="alert">
            {error()}
          </p>
        ) : null}

        <div class="flex gap-3">
          <Button type="submit" data-mode="local" disabled={createGraphMutation.isPending}>
            Create local graph
          </Button>
          <Button
            type="submit"
            variant="outline"
            data-mode="cloud"
            disabled={createGraphMutation.isPending}
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
