import { createFileRoute } from "@tanstack/solid-router";
import { useAtomValue } from "@effect/atom-solid";
import { Alert, AlertDescription } from "../components/ui/alert";
import { MatchAsyncResult, MatchTag } from "../lib";
import * as SessionAtom from "../lib/graph-access/session/atom";
import { FullCreateForm } from "./-create/full-create-form";
import { LocalOnlyCreateForm } from "./-create/local-only-create-form";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const session = useAtomValue(() => SessionAtom.find);

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Create graph</h1>
        <p class="text-fg-subtle">Name your graph and choose whether it stays local or syncs.</p>
      </header>

      <MatchAsyncResult
        when={session()}
        onInitial={() => <p class="text-sm text-fg-subtle">Checking sign-in status...</p>}
        onFailure={() => (
          <Alert variant="destructive">
            <AlertDescription>Failed to check sign-in status.</AlertDescription>
          </Alert>
        )}
        onSuccess={(result) => (
          <MatchTag
            when={result()}
            cases={{
              Some: () => <FullCreateForm />,
              None: () => <LocalOnlyCreateForm />,
            }}
          />
        )}
      />
    </main>
  );
}
