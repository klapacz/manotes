import { createFileRoute, Link, Navigate } from "@tanstack/solid-router";
import { Effect, Schema } from "effect";
import { Show, createSignal } from "solid-js";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button, buttonVariants } from "../components/ui/button";
import { AppForm, useAppForm } from "../components/ui/form";
import { List, ListItem } from "../components/ui/list";
import { MatchFailure, MatchTag } from "../lib";
import { createEffectCommand } from "../lib/solid-effect";
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

const decodeBackupEffect = Effect.fnUntraced(function* (file: File) {
  const backup = yield* GraphBackupFile.readBackupFile(file);

  return {
    backup,
    displayName: GraphBackupService.getSuggestedGraphName({
      backup,
      fileName: file.name,
    }),
  } satisfies DecodedBackup;
});

function RouteComponent() {
  const [decodedBackup, setDecodedBackup] = createSignal<DecodedBackup | null>(null);

  return (
    <main class="mx-auto flex w-full max-w-2xl flex-col gap-12 px-6 py-12">
      <header class="space-y-2">
        <h1 class="text-3xl tracking-tight font-title-serif">Import backup</h1>
        <p class="text-fg-subtle">Create a new local graph from an exported event backup.</p>
      </header>

      <Show
        when={decodedBackup()}
        fallback={<SelectBackupFileForm onDecoded={setDecodedBackup} />}
        keyed
      >
        {(decodedBackup) => (
          <ImportBackupForm
            decodedBackup={decodedBackup}
            onChooseAnother={() => setDecodedBackup(null)}
          />
        )}
      </Show>
    </main>
  );
}

const SelectBackupFileFormSchema = Schema.Struct({
  file: Schema.File,
}).pipe(Schema.toStandardSchemaV1);

type SelectBackupFileFormValues = {
  file: File | null;
};

function SelectBackupFileForm(props: { onDecoded: (decoded: DecodedBackup) => void }) {
  const decodeBackup = createEffectCommand(decodeBackupEffect, GraphAccessRuntime.rt);
  const defaultValues: SelectBackupFileFormValues = { file: null };

  const form = useAppForm(() => ({
    defaultValues,
    validators: {
      onDynamic: SelectBackupFileFormSchema,
    },
    async onSubmit({ value }) {
      const decoded = Schema.decodeUnknownSync(SelectBackupFileFormSchema)(value);
      props.onDecoded(await decodeBackup(decoded.file));
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm}>
      <MatchFailure
        exit={decodeBackup.exit()}
        onError={() => (
          <Alert variant="destructive">
            <AlertDescription>Invalid backup file.</AlertDescription>
          </Alert>
        )}
        onDefect={() => (
          <Alert variant="destructive">
            <AlertDescription>Invalid backup file.</AlertDescription>
          </Alert>
        )}
      />

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

const importBackupEffect = Effect.fnUntraced(function* (decodedBackup: DecodedBackup) {
  return yield* GraphBackupService.importBackupToNewGraph({
    backup: decodedBackup.backup,
    displayName: decodedBackup.displayName,
  });
});

const ImportBackupFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
}).pipe(Schema.toStandardSchemaV1);

function ImportBackupForm(props: { decodedBackup: DecodedBackup; onChooseAnother: () => void }) {
  const importBackup = createEffectCommand(importBackupEffect, GraphAccessRuntime.rt);

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
      <Show when={importBackup.value()}>
        {(graph) => <Navigate to="/$graph" params={{ graph: graph().localGraphId }} />}
      </Show>
      <MatchFailure
        exit={importBackup.exit()}
        onError={(error) => (
          <Alert variant="destructive">
            <AlertDescription>
              <MatchTag
                when={error()}
                fallback="Failed to import backup."
                cases={{
                  "LocalRegistry.DisplayNameTakenError": () =>
                    "A graph with that name already exists.",
                }}
              />
            </AlertDescription>
          </Alert>
        )}
        onDefect={() => (
          <Alert variant="destructive">
            <AlertDescription>Failed to import backup.</AlertDescription>
          </Alert>
        )}
      />

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
        <Button variant="outline" type="button" onClick={() => props.onChooseAnother()}>
          Choose another file
        </Button>
      </div>
    </AppForm>
  );
}
