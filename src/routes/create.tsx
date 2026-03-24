import { useMutation } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Cause, Exit, Predicate, Option, Boolean } from "effect";
import { createSignal } from "solid-js";
import * as LocalRegistry from "../lib/local-registry";
import { constant } from "effect/Function";
import { Button, buttonVariants } from "../components/ui/button";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const createGraphMutation = useMutation(() => ({
    mutationFn: async (trimmedName: string) => {
      const exit = await LocalRegistry.Runtime.runtime.runPromiseExit(
        LocalRegistry.Repo.createGraph(trimmedName),
      );

      if (Exit.isSuccess(exit)) {
        return void navigate({
          to: "/$graph",
          params: { graph: exit.value.localGraphId },
        });
      }

      const isisDisplayNameTakenError = Cause.failureOption(exit.cause).pipe(
        Option.map(Predicate.isTagged("LocalRegistry.DisplayNameTakenError")),
        Option.getOrElse(constant(false)),
      );

      setError(
        Boolean.match(isisDisplayNameTakenError, {
          onTrue: constant("A graph with that name already exists."),
          onFalse: constant("Failed to create graph."),
        }),
      );
    },
    onError() {
      setError("Failed to create graph.");
    },
  }));

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    const trimmedName = displayName().trim();
    if (!trimmedName) {
      setError("Graph name is required.");
      return;
    }

    setError(null);
    createGraphMutation.mutate(trimmedName);
  };

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Create graph</h1>
        <p class="text-fg-subtle">Name your graph.</p>
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

        {error() ? (
          <p class="text-sm text-error-fg" role="alert">
            {error()}
          </p>
        ) : null}

        <div class="flex gap-3">
          <Button type="submit" disabled={createGraphMutation.isPending}>
            Create graph
          </Button>
          <Link to="/" class={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
