import { useMutation } from "@tanstack/solid-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/solid-router";
import { Option } from "effect";
import { createSignal, Show } from "solid-js";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Form } from "../components/ui/form";
import { TextField, TextFieldInput, TextFieldLabel } from "../components/ui/text-field";
import { Runtime } from "../lib";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";

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

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
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
        <h1 class="text-3xl tracking-tight font-title-serif">Unlock {data().graph.displayName}</h1>
        <p class="text-fg-subtle">
          Enter the graph password to open this synced graph on this device.
        </p>
      </header>

      <Card>
        <CardContent>
          <Form onSubmit={handleSubmit}>
            <TextField>
              <TextFieldLabel for="unlock-graph-password">Password</TextFieldLabel>
              <TextFieldInput
                id="unlock-graph-password"
                type="password"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
                autofocus
              />
            </TextField>

            <Show when={error()}>
              {(error) => (
                <Alert variant="destructive">
                  <AlertDescription>{error()}</AlertDescription>
                </Alert>
              )}
            </Show>

            <Button type="submit" disabled={unlockMutation.isPending}>
              Unlock graph
            </Button>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
