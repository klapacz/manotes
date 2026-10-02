import { createEffectCommand } from "../../lib/solid-effect";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Schema } from "effect";
import { createSignal, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  type DialogTriggerProps,
} from "../../components/ui/dialog";
import { AppForm, useAppForm } from "../../components/ui/form";
import { MatchFailure, MatchTag } from "../../lib";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as GraphAccessCommands from "../../lib/graph-access/commands";
import * as LocalRegistry from "../../lib/graph-access/local-registry";

const RenameGraphFormSchema = Schema.Struct({
  displayName: GraphRegistryContract.DisplayNameSchema,
}).pipe(Schema.toStandardSchemaV1);

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function RenameGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const renameGraph = createEffectCommand(
    GraphAccessCommands.Actions.renameGraph,
    GraphAccessRuntime.rt,
  );

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

  const form = useAppForm(() => ({
    defaultValues: {
      displayName: local.graph.displayName,
    },
    validators: {
      onDynamic: RenameGraphFormSchema,
    },
    async onSubmit({ value }) {
      if (value.displayName === local.graph.displayName) return setOpen(false);

      await renameGraph({
        localGraphId: local.graph.localGraphId,
        displayName: value.displayName,
      });

      setOpen(false);
    },
  }));

  return (
    <Dialog
      open={open()}
      onOpenChange={(nextOpen) => {
        if (renameGraph.pending()) return;

        if (nextOpen) form.reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!renameGraph.pending()}>
          <AppForm form={form} AppForm={form.AppForm} spacing="compact">
            <DialogHeader>
              <DialogTitle>Rename graph</DialogTitle>
              <DialogDescription>
                Choose a new name for {local.graph.displayName}.
              </DialogDescription>
            </DialogHeader>

            <MatchFailure
              exit={renameGraph.exit()}
              onError={(error) => (
                <Alert variant="destructive">
                  <AlertDescription>
                    <MatchTag
                      when={error()}
                      fallback="Failed to rename graph."
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
                  <AlertDescription>Failed to rename graph.</AlertDescription>
                </Alert>
              )}
            />

            <form.AppField name="displayName">
              {(field) => <field.TextField label="Graph name" autofocus />}
            </form.AppField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={renameGraph.pending()}
              >
                Cancel
              </Button>
              <form.SubmitButton>Save</form.SubmitButton>
            </DialogFooter>
          </AppForm>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
