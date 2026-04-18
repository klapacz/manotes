import { useAtom } from "@effect/atom-solid";
import { createFileRoute, Navigate, redirect } from "@tanstack/solid-router";
import { Match, Option, Schema } from "effect";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AppForm, useAppForm } from "../components/ui/form";
import { MatchAsyncResult } from "../lib";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as GraphAccessCommands from "../lib/graph-access/commands";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as Resolution from "../lib/graph-access/resolution/service";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";

const UnlockGraphFormSchema = Schema.Struct({
  password: GraphEncryption.PasswordSchema,
}).pipe(Schema.toStandardSchemaV1);

export const Route = createFileRoute("/$graph_/unlock")({
  beforeLoad: async ({ params }) => {
    const resolution = await GraphAccessRuntime.rt.runPromise(Resolution.find(params.graph));

    Match.value(resolution).pipe(
      Match.tagsExhaustive({
        Missing: () => {
          throw redirect({ to: "/" });
        },
        Local: () => {
          throw redirect({ to: "/$graph", params: { graph: params.graph } });
        },
        CloudUnlocked: () => {
          throw redirect({ to: "/$graph", params: { graph: params.graph } });
        },
        CloudLocked: () => undefined,
      }),
    );
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

  const [unlockGraphResult, unlockGraph] = useAtom(GraphAccessCommands.Atom.unlockCloudGraph, {
    mode: "promise",
  });
  const form = useAppForm(() => ({
    defaultValues: {
      password: "",
    },
    validators: {
      onDynamic: UnlockGraphFormSchema,
    },
    async onSubmit({ value }) {
      await unlockGraph({
        graph: data().graph,
        password: GraphEncryption.normalizePassword(value.password),
      });
    },
  }));

  return (
    <main class="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Unlock {data().graph.displayName}</h1>
        <p class="text-fg-subtle">
          Enter the graph password to open this synced graph on this device.
        </p>
      </header>

      <AppForm form={form} AppForm={form.AppForm}>
        <MatchAsyncResult
          when={unlockGraphResult()}
          onSuccess={(graph) => <Navigate to="/$graph" params={{ graph: graph().localGraphId }} />}
          onError={(error) => (
            <Alert variant="destructive">
              <AlertDescription>
                {error() instanceof GraphEncryption.InvalidPasswordError
                  ? "Wrong password."
                  : error().message || "Failed to unlock graph."}
              </AlertDescription>
            </Alert>
          )}
          onDefect={() => (
            <Alert variant="destructive">
              <AlertDescription>Failed to unlock graph.</AlertDescription>
            </Alert>
          )}
        />

        <form.AppField name="password">
          {(field) => <field.TextField type="password" label="Password" autofocus />}
        </form.AppField>

        <form.SubmitButton>Unlock graph</form.SubmitButton>
      </AppForm>
    </main>
  );
}
