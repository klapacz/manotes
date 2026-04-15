import { useAtom } from "@effect/atom-solid";
import { createFileRoute, Navigate, redirect } from "@tanstack/solid-router";
import { Effect, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createSignal, Show } from "solid-js";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Form } from "../components/ui/form";
import { TextField, TextFieldInput, TextFieldLabel } from "../components/ui/text-field";
import { Runtime } from "../lib";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";

type UnlockGraphInput = {
  graph: Extract<LocalRegistry.Schema.Record, { mode: "cloud" }>;
  password: string;
};

const unlockGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fn("RoutesGraphUnlock.unlockGraph")(function* ({ graph, password }: UnlockGraphInput) {
    const graphKey = yield* Effect.tryPromise({
      try: () =>
        GraphEncryption.unwrapGraphKey({
          password,
          envelope: graph.graphKeyEnvelope,
        }),
      catch: (cause) =>
        cause instanceof GraphEncryption.InvalidPasswordError
          ? cause
          : cause instanceof Error
            ? cause
            : new Error("Failed to unlock graph."),
    });

    yield* Effect.tryPromise({
      try: () =>
        Runtime.setup({
          localGraphId: graph.localGraphId,
          displayName: graph.displayName,
          graphSyncConfig: {
            mode: "cloud",
            graphId: graph.graphId,
            graphKey,
          },
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error("Failed to unlock graph.")),
    });

    return {
      localGraphId: graph.localGraphId,
    };
  }),
);

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
    const graph = await GraphAccessRuntime.rt.runPromise(LocalRegistry.Repo.getGraph(params.graph));
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

  const [password, setPassword] = createSignal("");
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [unlockGraphResult, unlockGraph] = useAtom(unlockGraphAtom);

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();

    const normalizedPassword = GraphEncryption.normalizePassword(password());

    if (!normalizedPassword) {
      setValidationError("Password is required.");
      return;
    }

    setValidationError(null);
    unlockGraph({
      graph: data().graph,
      password: normalizedPassword,
    });
  }

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Unlock {data().graph.displayName}</h1>
        <p class="text-fg-subtle">
          Enter the graph password to open this synced graph on this device.
        </p>
      </header>

      <Form onSubmit={handleSubmit}>
        <TextField>
          <TextFieldLabel for="unlock-graph-password">Password</TextFieldLabel>
          <TextFieldInput
            id="unlock-graph-password"
            type="password"
            value={password()}
            onInput={(event) => setPassword(event.currentTarget.value)}
            autofocus
            disabled={unlockGraphResult().waiting}
          />
        </TextField>

        <Show when={validationError()}>
          {(error) => (
            <Alert variant="destructive">
              <AlertDescription>{error()}</AlertDescription>
            </Alert>
          )}
        </Show>

        {AsyncResult.matchWithError(unlockGraphResult(), {
          onInitial: () => null,
          onSuccess: (graph) => (
            <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
          ),
          onError: (error) => (
            <Alert variant="destructive">
              <AlertDescription>
                {error instanceof GraphEncryption.InvalidPasswordError
                  ? "Wrong password."
                  : error.message || "Failed to unlock graph."}
              </AlertDescription>
            </Alert>
          ),
          onDefect: () => (
            <Alert variant="destructive">
              <AlertDescription>Failed to unlock graph.</AlertDescription>
            </Alert>
          ),
        })}

        <Button type="submit" disabled={unlockGraphResult().waiting}>
          Unlock graph
        </Button>
      </Form>
    </main>
  );
}
