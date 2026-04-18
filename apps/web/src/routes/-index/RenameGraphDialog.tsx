import { useAtom } from "@effect/atom-solid";
import * as GraphRegistryContract from "@manotes/shared/graph-registry/contract";
import { Schema } from "effect";
import { createSignal, splitProps, type ValidComponent } from "solid-js";
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
import { MatchAsyncResult, MatchTag } from "../../lib";
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
  const [renameGraphResult, renameGraph] = useAtom(() => GraphAccessCommands.Atom.renameGraph, {
    mode: "promise",
  });
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

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
        if (renameGraphResult().waiting) return;
        if (nextOpen) form.reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!renameGraphResult().waiting}>
          <AppForm form={form} AppForm={form.AppForm} spacing="compact">
            <DialogHeader>
              <DialogTitle>Rename graph</DialogTitle>
              <DialogDescription>
                Choose a new name for {local.graph.displayName}.
              </DialogDescription>
            </DialogHeader>

            <MatchAsyncResult
              when={renameGraphResult()}
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
                disabled={renameGraphResult().waiting}
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
