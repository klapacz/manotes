import { useAtom } from "@effect/atom-solid";
import { Navigate } from "@tanstack/solid-router";
import { Schema } from "effect";
import { createSignal, splitProps, type ValidComponent } from "solid-js";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
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

const UploadGraphFormSchema = Schema.Struct({
  password: GraphEncryption.PasswordSchema,
}).pipe(Schema.toStandardSchemaV1);

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function UploadGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const [uploadGraphResult, uploadGraph] = useAtom(() => GraphAccessCommands.Atom.upload, {
    mode: "promise",
  });

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

  const form = useAppForm(() => ({
    defaultValues: {
      password: "",
    },
    validators: {
      onDynamic: UploadGraphFormSchema,
    },
    async onSubmit({ value }) {
      await uploadGraph({
        localGraphId: props.graph.localGraphId,
        password: GraphEncryption.normalizePassword(value.password),
      });
    },
  }));

  return (
    <Dialog
      open={open()}
      onOpenChange={(open) => {
        if (uploadGraphResult().waiting) return;

        if (open) form.reset();
        setOpen(open);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!uploadGraphResult().waiting}>
          <AppForm form={form} AppForm={form.AppForm} spacing="compact">
            <DialogHeader>
              <DialogTitle>Upload graph</DialogTitle>
              <DialogDescription>
                Enter a password to encrypt and sync {local.graph.displayName}.
              </DialogDescription>
            </DialogHeader>

            <MatchAsyncResult
              when={uploadGraphResult()}
              onSuccess={(graph) => (
                <Navigate to="/$graph" params={{ graph: graph().localGraphId }} />
              )}
              onError={(error) => (
                <Alert variant="destructive">
                  <AlertDescription>
                    <MatchTag
                      when={error()}
                      fallback="Failed to upload graph."
                      cases={{
                        "GraphAccess.LocalGraphNotFoundError": () =>
                          "That graph is no longer available on this device.",
                        "GraphAccess.LocalGraphAlreadySyncedError": () =>
                          "That graph is already synced.",
                        "GraphRegistry.DisplayNameTakenError": () =>
                          "A synced graph with that name already exists.",
                      }}
                    />
                  </AlertDescription>
                </Alert>
              )}
              onDefect={() => (
                <Alert variant="destructive">
                  <AlertDescription>Failed to upload graph.</AlertDescription>
                </Alert>
              )}
            />

            <form.AppField name="password">
              {(field) => (
                <field.TextField
                  type="password"
                  label="Password"
                  placeholder="Required to upload this graph"
                  autofocus
                />
              )}
            </form.AppField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={uploadGraphResult().waiting}
              >
                Cancel
              </Button>
              <form.SubmitButton>Upload graph</form.SubmitButton>
            </DialogFooter>
          </AppForm>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
