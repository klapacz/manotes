import { useAtom } from "@effect/atom-solid";
import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Effect, Schema } from "effect";
import type { FnContext } from "effect/unstable/reactivity/Atom";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, buttonVariants } from "../components/ui/button";
import { AppForm, useAppForm } from "../components/ui/form";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import * as KeyStoreService from "../lib/graph-access/key-store/service";
import * as RemoteRegistryClient from "../lib/graph-access/remote-registry/client";
import * as Session from "../lib/graph-access/session";
import { MatchAsyncResult, MatchTag } from "../lib";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

type CreateGraphInput = {
  mode: "cloud" | "local";
  displayName: string;
  password: string;
};

const createGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccess.createGraph")(function* (
    { mode, displayName, password }: CreateGraphInput,
    get: FnContext,
  ) {
    if (mode === "local") {
      return yield* LocalRegistry.Repo.createGraph(displayName);
    }

    const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(password));
    const session = yield* get.result(Session.atom);
    const client = yield* get.result(RemoteRegistryClient.atom);
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

    const keyStore = yield* KeyStoreService.Service;
    yield* keyStore.set(wrapped.envelope, wrapped.graphKey);

    return localGraph;
  }),
);

const CreateGraphFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
  // Password is optional for local graphs. Cloud-only required validation
  // happens in onSubmit based on the clicked action.
  password: Schema.String,
}).pipe(Schema.toStandardSchemaV1);

function RouteComponent() {
  const [createGraphResult, createGraph] = useAtom(createGraphAtom, { mode: "promise" });
  const form = useAppForm(() => ({
    defaultValues: {
      displayName: "",
      password: "",
    },
    validators: {
      onDynamic: CreateGraphFormSchema,
    },
    onSubmitMeta: {
      mode: "local" as "local" | "cloud",
    },
    async onSubmit({ value, meta }) {
      const password = GraphEncryption.normalizePassword(value.password);

      form.setErrorMap({ onSubmit: { fields: {} } });

      if (meta.mode === "cloud" && !password) {
        return form.setErrorMap({
          onSubmit: { fields: { password: "Password is required for synced graphs." } },
        });
      }

      await createGraph({
        mode: meta.mode,
        displayName: value.displayName,
        password,
      });
    },
  }));

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Create graph</h1>
        <p class="text-fg-subtle">Name your graph and choose whether it stays local or syncs.</p>
      </header>

      <AppForm form={form} AppForm={form.AppForm}>
        <MatchAsyncResult
          when={createGraphResult()}
          onSuccess={(graph) => <Navigate to="/$graph" params={{ graph: graph().localGraphId }} />}
          onError={(error) => (
            <Alert variant="destructive">
              <AlertDescription>
                <MatchTag
                  when={error()}
                  fallback="Failed to create graph."
                  cases={{
                    "LocalRegistry.DisplayNameTakenError": () =>
                      "A graph with that name already exists.",
                    "GraphRegistry.DisplayNameTakenError": () =>
                      "A synced graph with that name already exists.",
                  }}
                />
              </AlertDescription>
            </Alert>
          )}
          onDefect={() => (
            <Alert variant="destructive">
              <AlertDescription>Failed to create graph.</AlertDescription>
            </Alert>
          )}
        />

        <form.AppField name="displayName">
          {(field) => (
            <field.TextField
              id="create-graph-name"
              label="Graph name"
              placeholder="work"
              autofocus
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.TextField
              id="create-graph-password"
              type="password"
              label="Password for synced graphs"
              placeholder="Required only for synced graphs"
              description="Local graphs ignore this field. Synced graphs require it."
            />
          )}
        </form.AppField>

        <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
          {(state) => (
            <div class="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={state().isSubmitting}
                onClick={() => form.handleSubmit({ mode: "local" })}
              >
                Create local graph
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={state().isSubmitting}
                onClick={() => form.handleSubmit({ mode: "cloud" })}
              >
                Create synced graph
              </Button>
              <Link to="/" class={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
            </div>
          )}
        </form.Subscribe>
      </AppForm>
    </main>
  );
}
