import { useMutation } from "@tanstack/solid-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/solid-router";
import { Option } from "effect";
import { createSignal, Show } from "solid-js";
import { Runtime } from "../lib";
import * as GraphEncryption from "../lib/graph-encryption";
import * as LocalRegistry from "../lib/local-registry";

export const Route = createFileRoute("/$graph_/unlock")({
  beforeLoad: async ({ params }) => {
    const existingRuntime = Runtime.get(params.graph);
    if (!existingRuntime) return;

    // Redirect to already unlocked graph
    throw redirect({
      to: "/$graph",
      params: { graph: params.graph },
    });
  },
  loader: async ({ params }) => {
    const graph = await LocalRegistry.Runtime.runtime.runPromise(
      LocalRegistry.Repo.getGraph(params.graph),
    );
    // Graph not found
    if (Option.isNone(graph)) throw redirect({ to: "/" });
    // Let's unlock the cloud graph
    if (graph.value.mode === "cloud") return { graph: graph.value };
    // Redirect to local graph
    throw redirect({ to: "/$graph", params: { graph: params.graph } });
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const unlockMutation = useMutation(() => ({
    async mutationFn() {
      const graph = data().graph;

      const graphKey = await GraphEncryption.unwrapGraphKey({
        password: GraphEncryption.normalizePassword(password()),
        envelope: graph.graphKeyEnvelope,
      });

      // @effect-diagnostics-next-line floatingEffect:off
      await Runtime.setup({
        localGraphId: graph.localGraphId,
        displayName: graph.displayName,
        graphSyncConfig: {
          mode: "cloud",
          graphId: graph.graphId,
          graphKey,
        },
      });

      await navigate({
        to: "/$graph",
        params: { graph: graph.localGraphId },
      });
    },
    onError(error) {
      if (error instanceof GraphEncryption.InvalidPasswordError) {
        return setError("Wrong password.");
      }

      if (error instanceof Error) {
        return setError(error.message);
      }

      setError("Failed to unlock graph.");
    },
  }));

  function handleSubmit(
    event: SubmitEvent & { currentTarget: HTMLFormElement },
  ) {
    event.preventDefault();

    if (!GraphEncryption.normalizePassword(password())) {
      setError("Password is required.");
      return;
    }

    setError(null);
    unlockMutation.mutate();
  }

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">
          Unlock {data().graph.displayName}
        </h1>
        <p class="text-fg-subtle">
          Enter the graph password to open this synced graph on this device.
        </p>
      </header>

      <form class="space-y-4" onSubmit={handleSubmit}>
        <label class="block space-y-2">
          <span class="text-sm font-medium">Password</span>
          <input
            type="password"
            value={password()}
            onInput={(event) => setPassword(event.currentTarget.value)}
            class="w-full rounded-md border border-border bg-transparent px-3 py-2 outline-none"
            autofocus
          />
        </label>

        <Show when={error()}>
          {(error) => (
            <p class="text-sm text-error-fg" role="alert">
              {error()}
            </p>
          )}
        </Show>

        <button
          type="submit"
          class="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-bg-subtle disabled:opacity-50"
          disabled={unlockMutation.isPending}
        >
          Unlock graph
        </button>
      </form>
    </main>
  );
}
