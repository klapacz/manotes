import { useAtom } from "../../lib/atom-solid";
import { Link, Navigate } from "@tanstack/solid-router";
import { GraphEncryption } from "@manotes/shared/graph-encryption";
import { GraphRegistryContract } from "@manotes/shared/graph-registry/contract";
import { Effect, Schema } from "effect";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button, buttonVariants } from "../../components/ui/button";
import { AppForm, useAppForm, afterSubmit } from "../../components/ui/form";
import { MatchAsyncResult, MatchTag } from "../../lib";
import { GraphAccessRuntime } from "../../lib/graph-access/runtime";
import { GraphAccessCommandsProvision } from "../../lib/graph-access/commands/provision";

const CreateGraphFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
  password: Schema.String,
  mode: Schema.Literals(["local", "cloud"]),
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

    if (mode === "local") return yield* provision.createLocal({ displayName });

    return yield* provision.createSynced({ displayName, password });
  }),
);

export function FullCreateForm() {
  const [createResult, createGraph] = useAtom(() => createGraphAtom, { mode: "promise" });

  const defaultValues: StandardSchemaV1.InferInput<typeof CreateGraphFormSchema> = {
    displayName: "",
    password: "",
    mode: "local",
  };

  const form = useAppForm(() => ({
    defaultValues,
    validators: [afterSubmit(CreateGraphFormSchema)],
    async onSubmit({ value, createValidationError }) {
      const password = GraphEncryption.normalizePassword(value.password);

      if (value.mode === "cloud" && !password) {
        return createValidationError({
          fields: { password: "Password is required for synced graphs." },
        });
      }

      await createGraph({ mode: value.mode, displayName: value.displayName, password });
    },
  }));

  const submit = (mode: "local" | "cloud") => {
    form.setFieldValue("mode", mode);

    return form.handleSubmit();
  };

  return (
    <AppForm form={form} AppForm={form.AppForm} submit={() => submit("local")}>
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
                  "LocalRegistry.DisplayNameTakenError": () => {
                    return "A graph with that name already exists.";
                  },
                  "GraphRegistry.DisplayNameTakenError": () => {
                    return "A synced graph with that name already exists.";
                  },
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

      <form.Field name="displayName">
        {(field) => (
          <field.TextField id="create-graph-name" label="Graph name" placeholder="work" autofocus />
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <field.TextField
            id="create-graph-password"
            type="password"
            label="Password for synced graphs"
            placeholder="Required only for synced graphs"
            description="Local graphs ignore this field. Synced graphs require it."
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting })}>
        {(state) => (
          <div class="flex flex-wrap gap-3">
            <Button type="button" disabled={state().isSubmitting} onClick={() => submit("local")}>
              Create local graph
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={state().isSubmitting}
              onClick={() => submit("cloud")}
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
