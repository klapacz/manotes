import { useAtom, useAtomValue } from "@effect/atom-solid";
import { createFileRoute, redirect, Navigate } from "@tanstack/solid-router";
import { Match, Schema } from "effect";
import { Alert, AlertDescription } from "../components/ui/alert";
import { AppForm, useAppForm } from "../components/ui/form";
import { MatchAsyncResult, MatchTag, createSyncedAtom } from "../lib";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as GraphAccessCommands from "../lib/graph-access/commands";
import * as Resolution from "../lib/graph-access/resolution/service";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { GraphDestination } from "../lib/graph-access/graph-runtime/destination";

const UnlockGraphFormSchema = Schema.Struct({
  password: GraphEncryption.PasswordSchema,
  remember: Schema.Boolean,
}).pipe(Schema.toStandardSchemaV1);

export const Route = createFileRoute("/$graph_/unlock")({
  validateSearch: GraphDestination.UnlockSearch.pipe(Schema.toStandardSchemaV1),
  beforeLoad: async ({ params, search }) => {
    const resolution = await GraphAccessRuntime.rt.runPromise(Resolution.find(params.graph));

    return Match.value(resolution).pipe(
      Match.tag("Missing", () => {
        throw redirect({ to: "/", replace: true });
      }),
      Match.tag("Local", "CloudUnlocked", () => {
        throw redirect(GraphDestination.linkOptions(params.graph, search.returnTo));
      }),
      Match.tag("CloudLocked", ({ record }) => ({ graph: record })),
      Match.exhaustive,
    );
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useRouteContext();
  const search = Route.useSearch();
  const params = Route.useParams();
  const localGraphIdAtom = createSyncedAtom(() => params().graph);

  const resolutionAtom = GraphAccessRuntime.atom.atom((get) =>
    Resolution.findReactive(get(localGraphIdAtom)),
  );

  const resolution = useAtomValue(() => resolutionAtom);

  const [unlockGraphResult, unlockGraph] = useAtom(
    () => GraphAccessCommands.Atom.unlockCloudGraph,
    {
      mode: "promise",
    },
  );

  const form = useAppForm(() => ({
    defaultValues: {
      password: "",
      remember: false,
    },
    validators: {
      onDynamic: UnlockGraphFormSchema,
    },
    async onSubmit({ value }) {
      await unlockGraph({
        graph: data().graph,
        password: GraphEncryption.normalizePassword(value.password),
        remember: value.remember,
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
          when={resolution()}
          onFailure={() => (
            <Alert variant="destructive">
              <AlertDescription>Failed to read graph access.</AlertDescription>
            </Alert>
          )}
          onSuccess={(state) => (
            <MatchTag
              when={state()}
              cases={{
                Missing: () => <Navigate to="/" replace />,
                Local: () => (
                  <Navigate {...GraphDestination.linkOptions(params().graph, search().returnTo)} />
                ),
                CloudUnlocked: () => (
                  <Navigate {...GraphDestination.linkOptions(params().graph, search().returnTo)} />
                ),
                CloudLocked: () => null,
              }}
            />
          )}
        />
        <MatchAsyncResult
          when={unlockGraphResult()}
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

        <form.AppField name="remember">
          {(field) => (
            <div class="flex items-start gap-3">
              <input
                id="remember-graph"
                class="mt-1 size-4"
                type="checkbox"
                name={field().name}
                checked={field().state.value}
                aria-describedby="remember-graph-description"
                onChange={(event) => field().handleChange(event.currentTarget.checked)}
                onBlur={() => field().handleBlur()}
              />
              <div class="space-y-1">
                <label for="remember-graph" class="text-sm font-medium">
                  Remember on this device
                </label>
                <p id="remember-graph-description" class="text-fg-subtle text-sm">
                  Open without its password on this device. Lock graph forgets it. Anyone with
                  access to this browser profile can open remembered graphs.
                </p>
              </div>
            </div>
          )}
        </form.AppField>

        <form.SubmitButton>Unlock graph</form.SubmitButton>
      </AppForm>
    </main>
  );
}
