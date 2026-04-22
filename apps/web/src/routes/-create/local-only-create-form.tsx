import { useAtom } from "@effect/atom-solid";
import { Link, Navigate } from "@tanstack/solid-router";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Effect, Schema } from "effect";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button, buttonVariants } from "../../components/ui/button";
import { AppForm, useAppForm } from "../../components/ui/form";
import { MatchAsyncResult, MatchTag } from "../../lib";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as GraphAccessCommandsProvision from "../../lib/graph-access/commands/provision";

const CreateLocalGraphFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
}).pipe(Schema.toStandardSchemaV1);

const createLocalGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fn("RoutesCreate.createLocalGraph")(function* ({ displayName }: { displayName: string }) {
    const provision = yield* GraphAccessCommandsProvision.Service;
    return yield* provision.createLocal({ displayName });
  }),
);

export function LocalOnlyCreateForm() {
  const [createResult, createGraph] = useAtom(() => createLocalGraphAtom, { mode: "promise" });
  const form = useAppForm(() => ({
    defaultValues: { displayName: "" },
    validators: { onDynamic: CreateLocalGraphFormSchema },
    async onSubmit({ value }) {
      await createGraph({ displayName: value.displayName });
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

      <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
        {(state) => (
          <div class="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={state().isSubmitting}
              onClick={() => form.handleSubmit()}
            >
              Create local graph
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
