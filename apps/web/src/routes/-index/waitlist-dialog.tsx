import { useAtom } from "@effect/atom-solid";
import * as EmailSchema from "@manotes/shared/schema/email";
import { Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { createSignal, onMount, Show, type ValidComponent } from "solid-js";
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
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as SessionAtom from "../../lib/graph-access/session/atom";

type OtpRequest = {
  readonly email: string;
};

const RequestOtpFormSchema = Schema.Struct({
  email: EmailSchema.Email,
}).pipe(Schema.toStandardSchemaV1);

const VerifyOtpFormSchema = Schema.Struct({
  otp: Schema.String.pipe(Schema.check(Schema.isMinLength(6), Schema.isMaxLength(6))),
}).pipe(Schema.toStandardSchemaV1);

export function WaitlistDialog<T extends ValidComponent = typeof Button>(
  props: DialogTriggerProps<T>,
) {
  const [open, setOpen] = createSignal(false);
  const [otpRequest, setOtpRequest] = createSignal<OtpRequest | null>(null);

  return (
    <Dialog
      open={open()}
      onOpenChange={(next) => {
        if (next) setOtpRequest(null);
        setOpen(next);
      }}
    >
      <DialogTrigger {...props} />

      <DialogPortal>
        <DialogContent>
          <Show
            when={otpRequest()}
            fallback={<RequestOtpForm onClose={() => setOpen(false)} onRequested={setOtpRequest} />}
            keyed
          >
            {(request) => (
              <VerifyOtpForm
                request={request}
                onBack={() => setOtpRequest(null)}
                onVerified={() => {
                  GraphAccessRuntime.registry.refresh(SessionAtom.get);
                  GraphAccessRuntime.registry.refresh(SessionAtom.find);
                  setOpen(false);
                }}
              />
            )}
          </Show>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function RequestOtpForm(props: {
  readonly onClose: () => void;
  readonly onRequested: (request: OtpRequest) => void;
}) {
  const [checkResult, checkWaitlist] = useAtom(() => SessionAtom.checkWaitlist, {
    mode: "promise",
  });
  const [requestResult, requestOtp] = useAtom(() => SessionAtom.requestOtp, {
    mode: "promise",
  });

  onMount(() => {
    void checkWaitlist(Atom.Reset);
    void requestOtp(Atom.Reset);
  });

  const form = useAppForm(() => ({
    defaultValues: { email: "" },
    validators: { onDynamic: RequestOtpFormSchema },
    async onSubmit({ value }) {
      const res = await checkWaitlist({ payload: { email: value.email } });
      if (res.status === "WAITLIST") return;

      await requestOtp({ payload: { email: value.email } });
      props.onRequested({ email: value.email });
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm} spacing="compact">
      <DialogHeader>
        <DialogTitle>Sign in or join the waitlist</DialogTitle>
        <DialogDescription>Enter your email to continue.</DialogDescription>
      </DialogHeader>

      <MatchAsyncResult
        when={checkResult()}
        onSuccess={(res) => (
          <Show when={res().status === "WAITLIST"}>
            <Alert>
              <AlertDescription>You're on the waitlist!</AlertDescription>
            </Alert>
          </Show>
        )}
        onFailure={() => (
          <Alert variant="destructive">
            <AlertDescription>Could not check your account.</AlertDescription>
          </Alert>
        )}
      />

      <MatchAsyncResult
        when={requestResult()}
        onFailure={() => (
          <Alert variant="destructive">
            <AlertDescription>Could not send a sign-in code.</AlertDescription>
          </Alert>
        )}
      />

      <form.AppField name="email">
        {(field) => <field.TextField label="Email" type="email" autofocus />}
      </form.AppField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <form.SubmitButton>Continue</form.SubmitButton>
      </DialogFooter>
    </AppForm>
  );
}

function VerifyOtpForm(props: {
  readonly request: OtpRequest;
  readonly onBack: () => void;
  readonly onVerified: () => void;
}) {
  const [verifyResult, verifyOtp] = useAtom(() => SessionAtom.verifyOtp, {
    mode: "promise",
  });
  const [requestResult, requestOtp] = useAtom(() => SessionAtom.requestOtp, {
    mode: "promise",
  });

  onMount(() => {
    void verifyOtp(Atom.Reset);
    void requestOtp(Atom.Reset);
  });

  const form = useAppForm(() => ({
    defaultValues: { otp: "" },
    validators: { onDynamic: VerifyOtpFormSchema },
    async onSubmit({ value }) {
      await verifyOtp({
        payload: {
          email: props.request.email,
          otp: value.otp,
        },
      });

      props.onVerified();
    },
  }));

  return (
    <AppForm form={form} AppForm={form.AppForm} spacing="compact">
      <DialogHeader>
        <DialogTitle>Enter your sign-in code</DialogTitle>
        <DialogDescription>We sent a 6-digit code to {props.request.email}.</DialogDescription>
      </DialogHeader>

      <MatchAsyncResult
        when={verifyResult()}
        onFailure={() => (
          <Alert variant="destructive">
            <AlertDescription>Invalid or expired code.</AlertDescription>
          </Alert>
        )}
      />

      <MatchAsyncResult
        when={requestResult()}
        onSuccess={() => (
          <Alert>
            <AlertDescription>Sent a new code.</AlertDescription>
          </Alert>
        )}
        onFailure={() => (
          <Alert variant="destructive">
            <AlertDescription>Could not send a new code.</AlertDescription>
          </Alert>
        )}
      />

      <form.AppField name="otp">
        {(field) => (
          <field.TextField
            label="Code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength={6}
            autofocus
          />
        )}
      </form.AppField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={props.onBack}>
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await requestOtp({ payload: { email: props.request.email } });
            form.reset();
            void verifyOtp(Atom.Reset);
          }}
        >
          Resend code
        </Button>
        <form.SubmitButton>Sign in</form.SubmitButton>
      </DialogFooter>
    </AppForm>
  );
}
