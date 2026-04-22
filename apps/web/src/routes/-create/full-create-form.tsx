import { useAtom } from "@effect/atom-solid";
import { Link, Navigate } from "@tanstack/solid-router";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Effect, Schema } from "effect";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button, buttonVariants } from "../../components/ui/button";
import { AppForm, useAppForm } from "../../components/ui/form";
import { MatchAsyncResult, MatchTag } from "../../lib";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as GraphAccessCommandsProvision from "../../lib/graph-access/commands/provision";

const CreateGraphFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
  password: Schema.String,
}).pipe(Schema.toStandardSchemaV1);

const createGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fn("RoutesCreate.createGraph")(function* ({
    mode,
    displayName,
    password,
  }: {
    mode: "local" | "cloud";
    displayName: string;
    password: string;
  }) {
    const provision = yield* GraphAccessCommandsProvision.Service;
    if (mode === "local") {
      return yield* provision.createLocal({ displayName });
    }
    return yield* provision.createSynced({ displayName, password });
  }),
);

export function FullCreateForm() {
  const [createResult, createGraph] = useAtom(() => createGraphAtom, { mode: "promise" });
  const form = useAppForm(() => ({
    defaultValues: { displayName: "", password: "" },
    validators: { onDynamic: CreateGraphFormSchema },
    onSubmitMeta: { mode: "local" as "local" | "cloud" },
    async onSubmit({ value, meta }) {
      const password = GraphEncryption.normalizePassword(value.password);
      form.setErrorMap({ onSubmit: { fields: {} } });

      if (meta.mode === "cloud" && !password) {
        return form.setErrorMap({
          onSubmit: { fields: { password: "Password is required for synced graphs." } },
        });
      }

      await createGraph({ mode: meta.mode, displayName: value.displayName, password });
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm}>
      <MatchAsyncResult
        when={createResult()}
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
          <field.TextField id="create-graph-name" label="Graph name" placeholder="work" autofocus />
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
  );
}
