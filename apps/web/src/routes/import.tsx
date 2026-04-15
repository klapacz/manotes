import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { Effect, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { Show, createMemo } from "solid-js";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, buttonVariants } from "../components/ui/button";
import { AppForm, useAppForm } from "../components/ui/form";
import { List, ListItem } from "../components/ui/list";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import * as GraphBackupFile from "../lib/graph-backup/file";
import * as GraphBackupService from "../lib/graph-backup/service";
import type * as GraphBackupSchema from "../lib/graph-backup/schema";

export const Route = createFileRoute("/import")({
  component: RouteComponent,
});

type DecodedBackup = {
  backup: GraphBackupSchema.Bundle;
  displayName: string;
};

const decodeBackupAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* (file: File) {
    const backup = yield* GraphBackupFile.readBackupFile(file);

    return {
      backup,
      displayName: GraphBackupService.getSuggestedGraphName({
        backup,
        fileName: file.name,
      }),
    } satisfies DecodedBackup;
  }),
);

function RouteComponent() {
  const decodeBackupResult = useAtomValue(decodeBackupAtom);
  const decodedBackup = createMemo(() => {
    const result = decodeBackupResult();
    return AsyncResult.isSuccess(result) ? result.value : null;
  });

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Import backup</h1>
        <p class="text-fg-subtle">Create a new local graph from an exported event backup.</p>
      </header>

      <Show when={decodedBackup()} fallback={<SelectBackupFileForm />} keyed>
        {(decodedBackup) => <ImportBackupForm decodedBackup={decodedBackup} />}
      </Show>
    </main>
  );
}

const SelectBackupFileFormSchema = Schema.Struct({
  file: Schema.File,
}).pipe(Schema.toStandardSchemaV1);

function SelectBackupFileForm() {
  const [decodeBackupResult, decodeBackup] = useAtom(decodeBackupAtom, { mode: "promise" });

  const form = useAppForm(() => ({
    defaultValues: {
      file: null as File | null,
    },
    validators: {
      onDynamic: SelectBackupFileFormSchema,
    },
    async onSubmit({ value }) {
      const decoded = Schema.decodeUnknownSync(SelectBackupFileFormSchema)(value);
      await decodeBackup(decoded.file);
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm}>
      {AsyncResult.matchWithError(decodeBackupResult(), {
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

      <form.AppField name="file">
        {(field) => (
          <field.FileField
            id="import-backup-file"
            label="Backup file"
            accept="application/json,.json"
          />
        )}
      </form.AppField>

      <div class="flex flex-wrap gap-3">
        <form.SubmitButton>Decode backup</form.SubmitButton>
        <Link to="/" class={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </AppForm>
  );
}

const importBackupAtom = GraphAccessRuntime.atom.fn(
  Effect.fnUntraced(function* (decodedBackup: DecodedBackup) {
    return yield* GraphBackupService.importBackupToNewGraph({
      backup: decodedBackup.backup,
      displayName: decodedBackup.displayName,
    });
  }),
);

const ImportBackupFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
}).pipe(Schema.toStandardSchemaV1);

function ImportBackupForm(props: { decodedBackup: DecodedBackup }) {
  const [importBackupResult, importBackup] = useAtom(importBackupAtom, { mode: "promise" });

  const setDecodedBackup = useAtomSet(decodeBackupAtom);
  const form = useAppForm(() => ({
    defaultValues: {
      displayName: props.decodedBackup.displayName,
    },
    validators: {
      onDynamic: ImportBackupFormSchema,
    },
    async onSubmit({ value }) {
      await importBackup({
        backup: props.decodedBackup.backup,
        displayName: value.displayName,
      });
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm}>
      {AsyncResult.matchWithError(importBackupResult(), {
        onInitial: () => null,
        onSuccess: (graph) => (
          <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
        ),
        onError: (error) => (
          <Alert variant="destructive">
            <AlertDescription>
              {error._tag === "LocalRegistry.DisplayNameTakenError"
                ? "A graph with that name already exists."
                : "Failed to import backup."}
            </AlertDescription>
          </Alert>
        ),
        onDefect: () => (
          <Alert variant="destructive">
            <AlertDescription>Failed to import backup.</AlertDescription>
          </Alert>
        ),
      })}

      <List>
        <ListItem class="grid gap-3 px-4 py-3 text-sm sm:grid-cols-2">
          <div>
            <span class="text-fg-subtle">Source graph</span>
            <p class="font-medium">
              {props.decodedBackup.backup.sourceGraphDisplayName || "Unknown"}
            </p>
          </div>
          <div>
            <span class="text-fg-subtle">Events</span>
            <p class="font-medium">{props.decodedBackup.backup.events.length}</p>
          </div>
        </ListItem>
      </List>

      <form.AppField name="displayName">
        {(field) => <field.TextField label="Graph name" placeholder="Imported graph" />}
      </form.AppField>

      <div class="flex flex-wrap gap-3">
        <form.SubmitButton>Import backup</form.SubmitButton>
        <Button variant="outline" type="button" onClick={() => setDecodedBackup(Atom.Reset)}>
          Choose another file
        </Button>
      </div>
    </AppForm>
  );
}
