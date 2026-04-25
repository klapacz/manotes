import { useAtom } from "@effect/atom-solid";
import * as EmailSchema from "@manotes/shared/schema/email";
import { Schema } from "effect";
import { createSignal, Show, type ValidComponent } from "solid-js";
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
import { MatchAsyncResult } from "../../lib";
import * as SessionAtom from "../../lib/graph-access/session/atom";
import { Atom } from "effect/unstable/reactivity";

const WaitlistFormSchema = Schema.Struct({
  email: EmailSchema.Email,
}).pipe(Schema.toStandardSchemaV1);

export function WaitlistDialog<T extends ValidComponent = typeof Button>(
  props: DialogTriggerProps<T>,
) {
  const [open, setOpen] = createSignal(false);
  const [result, checkWaitlist] = useAtom(() => SessionAtom.checkWaitlist, { mode: "promise" });

  const form = useAppForm(() => ({
    defaultValues: { email: "" },
    validators: { onDynamic: WaitlistFormSchema },
    async onSubmit({ value }) {
      const res = await checkWaitlist({ payload: { email: value.email } });
      if (res.status === "ACTIVE") window.location.href = "/login";
    },
  }));

  return (
    <Dialog
      open={open()}
      onOpenChange={(next) => {
        if (result().waiting) return;
        if (next) {
          form.reset();
          void checkWaitlist(Atom.Reset);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger {...props} />

      <DialogPortal>
        <DialogContent showCloseButton={!result().waiting}>
          <AppForm form={form} AppForm={form.AppForm} spacing="compact">
            <DialogHeader>
              <DialogTitle>Join the waitlist</DialogTitle>
              <DialogDescription>
                Enter your email to join the waitlist for cloud sync.
              </DialogDescription>
            </DialogHeader>

            <MatchAsyncResult
              when={result()}
              onSuccess={(res) => (
                <Show when={res().status === "WAITLIST"}>
                  <Alert>
                    <AlertDescription>You're on the waitlist!</AlertDescription>
                  </Alert>
                </Show>
              )}
              onFailure={() => (
                <Alert variant="destructive">
                  <AlertDescription>Something went wrong.</AlertDescription>
                </Alert>
              )}
            />

            <form.AppField name="email">
              {(field) => <field.TextField label="Email" type="email" autofocus />}
            </form.AppField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={result().waiting}
              >
                Cancel
              </Button>
              <form.SubmitButton>Submit</form.SubmitButton>
            </DialogFooter>
          </AppForm>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
