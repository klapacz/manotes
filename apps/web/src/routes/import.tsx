import { useAtom } from "@effect/atom-solid";
import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { Effect, Match } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createSignal, Show } from "solid-js";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, buttonVariants } from "../components/ui/button";
import { Form } from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { List, ListItem } from "../components/ui/list";
import { TextField, TextFieldInput, TextFieldLabel } from "../components/ui/text-field";
import * as GraphBackupFile from "../lib/graph-backup/file";
import * as GraphBackupService from "../lib/graph-backup/service";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import type * as GraphBackupSchema from "../lib/graph-backup/schema";

export const Route = createFileRoute("/import")({
  component: RouteComponent,
});

const decodeBackupFileAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* (file: File) {
    const backup = yield* GraphBackupFile.readBackupFile(file);

    return {
      backup,
      suggestedDisplayName: GraphBackupService.getSuggestedGraphName({
        backup,
        fileName: file.name,
      }),
    };
  }),
);

const importBackupAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* ({
    backup,
    displayName,
  }: {
    backup: typeof GraphBackupSchema.Bundle.Type;
    displayName: string;
  }) {
    return yield* Effect.tryPromise(() =>
      GraphBackupService.importBackupToNewGraph({
        backup,
        displayName,
      }),
    );
  }),
);

// TODO: works for now, but has to be rewritten at some point
function RouteComponent() {
  const [displayName, setDisplayName] = createSignal("");
  const [selectedFile, setSelectedFile] = createSignal<File | null>(null);
  const [backup, setBackup] = createSignal<typeof GraphBackupSchema.Bundle.Type | null>(null);
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [suggestedDisplayName, setSuggestedDisplayName] = createSignal("");
  const [decodeBackupFileResult, decodeBackupFile] = useAtom(decodeBackupFileAtom);
  const [importBackupResult, importBackup] = useAtom(importBackupAtom);

  createEffect(() => {
    const file = selectedFile();

    if (file === null) {
      setBackup(null);
      setSuggestedDisplayName("");
      return;
    }

    AsyncResult.matchWithError(decodeBackupFileResult(), {
      onInitial: () => null,
      onSuccess: (result) => {
        const nextSuggestedDisplayName = result.value.suggestedDisplayName;
        const previousSuggestedDisplayName = suggestedDisplayName();

        setBackup(result.value.backup);
        setSuggestedDisplayName(nextSuggestedDisplayName);
        setDisplayName((current) =>
          current.trim().length === 0 || current.trim() === previousSuggestedDisplayName
            ? nextSuggestedDisplayName
            : current,
        );
        return null;
      },
      onError: () => {
        setBackup(null);
        return null;
      },
      onDefect: () => {
        setBackup(null);
        return null;
      },
    });
  });

  function handleFileChange(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0] ?? null;
    setSelectedFile(file);

    if (file === null) {
      setBackup(null);
      setValidationError(null);
      return;
    }

    setBackup(null);
    setSuggestedDisplayName("");
    setValidationError(null);
    decodeBackupFile(file);
  }

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();

    const parsedBackup = backup();

    if (selectedFile() === null || parsedBackup === null) {
      setValidationError("Choose a valid backup file.");
      return;
    }

    if (displayName().trim().length === 0) {
      setValidationError("Graph name is required.");
      return;
    }

    setValidationError(null);
    importBackup({
      backup: parsedBackup,
      displayName: displayName().trim(),
    });
  }

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Import backup</h1>
        <p class="text-fg-subtle">Create a new local graph from an exported event backup.</p>
      </header>

      <Form onSubmit={handleSubmit}>
        <div class="space-y-2">
          <Label for="import-backup-file">Backup file</Label>
          <Input
            id="import-backup-file"
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
          />
        </div>

        <TextField>
          <TextFieldLabel for="import-graph-name">Graph name</TextFieldLabel>
          <TextFieldInput
            id="import-graph-name"
            value={displayName()}
            onInput={(event) => setDisplayName(event.currentTarget.value)}
            placeholder="Imported graph"
          />
        </TextField>

        <Show when={backup()}>
          {(parsedBackup) => (
            <List>
              <ListItem class="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
                <div>
                  <span class="text-fg-subtle">Source graph</span>
                  <p class="font-medium">{parsedBackup().sourceGraphDisplayName || "Unknown"}</p>
                </div>
                <div>
                  <span class="text-fg-subtle">Events</span>
                  <p class="font-medium">{parsedBackup().events.length}</p>
                </div>
              </ListItem>
            </List>
          )}
        </Show>

        <Show when={validationError()}>
          {(error) => (
            <Alert variant="destructive">
              <AlertDescription>{error()}</AlertDescription>
            </Alert>
          )}
        </Show>

        <Show when={selectedFile() !== null}>
          {AsyncResult.matchWithError(decodeBackupFileResult(), {
            onInitial: () => null,
            onSuccess: () => null,
            onError: () => (
              <Alert variant="destructive">
                <AlertDescription>Invalid backup file.</AlertDescription>
              </Alert>
            ),
            onDefect: () => (
              <Alert variant="destructive">
                <AlertDescription>Invalid backup file.</AlertDescription>
              </Alert>
            ),
          })}
        </Show>

        {AsyncResult.matchWithError(importBackupResult(), {
          onInitial: () => null,
          onSuccess: (graph) => (
            <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
          ),
          onError: (error) => (
            <Alert variant="destructive">
              <AlertDescription>
                {Match.value(error).pipe(
                  Match.tag("SqlError", (error) =>
                    LocalRegistry.Errors.isDisplayNameUniquenessSqlError(error.cause)
                      ? "A graph with that name already exists."
                      : "Failed to import backup.",
                  ),
                  Match.tag("UnknownError", () => "Failed to import backup."),
                  Match.orElse(() => "Failed to import backup."),
                )}
              </AlertDescription>
            </Alert>
          ),
          onDefect: () => (
            <Alert variant="destructive">
              <AlertDescription>Failed to import backup.</AlertDescription>
            </Alert>
          ),
        })}

        <div class="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={decodeBackupFileResult().waiting || importBackupResult().waiting}
          >
            Import backup
          </Button>
          <Link to="/" class={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
        </div>
      </Form>
    </main>
  );
}
