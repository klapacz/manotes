import { useAtom } from "@effect/atom-solid";
import { Navigate } from "@tanstack/solid-router";
import { Effect, Option, Schema } from "effect";
import type { FnContext } from "effect/unstable/reactivity/Atom";
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
import { MatchAsyncResult, MatchTag, Runtime } from "../../lib";
import * as GraphAccessErrors from "../../lib/graph-access/errors";
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import * as RemoteRegistryClient from "../../lib/graph-access/remote-registry/client";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as Session from "../../lib/graph-access/session";

type UploadGraphInput = {
  password: string;
  localGraphId: string;
};

const UploadGraphFormSchema = Schema.Struct({
  password: GraphEncryption.PasswordSchema,
}).pipe(Schema.toStandardSchemaV1);

const uploadGraphAtom = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccess.uploadGraph")(function* (opts: UploadGraphInput, get: FnContext) {
    const wrapped = yield* Effect.tryPromise(() => GraphEncryption.createGraphKey(opts.password));
    const session = yield* get.result(Session.atom);
    const client = yield* get.result(RemoteRegistryClient.atom);

    const originalLocalGraph = yield* LocalRegistry.Repo.getGraph(opts.localGraphId);

    if (Option.isNone(originalLocalGraph)) {
      return yield* Effect.fail(
        new GraphAccessErrors.LocalGraphNotFoundError({ localGraphId: opts.localGraphId }),
      );
    }
    if (originalLocalGraph.value.mode === "cloud") {
      return yield* Effect.fail(
        new GraphAccessErrors.LocalGraphAlreadySyncedError({
          localGraphId: originalLocalGraph.value.localGraphId,
        }),
      );
    }

    // TODO: This creates the remote graph before the local registry/runtime update.
    // If a later step fails, we orphan the remote graph and retries hit display-name taken.
    const graph = yield* client.createGraph({
      displayName: originalLocalGraph.value.displayName,
      graphKeyEnvelope: wrapped.envelope,
    });

    const updatedLocalGraph = yield* LocalRegistry.Repo.updateGraph({
      localGraphId: originalLocalGraph.value.localGraphId,
      accountId: session.accountId,

      mode: "cloud",
      graphId: graph.graphId,
      displayName: graph.displayName,
      graphKeyEnvelope: graph.graphKeyEnvelope,
    });

    yield* Effect.sync(() =>
      Runtime.setup({
        localGraphId: updatedLocalGraph.localGraphId,
        displayName: updatedLocalGraph.displayName,
        graphSyncConfig: {
          mode: "cloud",
          graphId: graph.graphId,
          graphKey: wrapped.graphKey,
        },
      }),
    );

    return updatedLocalGraph;
  }),
);

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function UploadGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);
  const [uploadGraphResult, uploadGraph] = useAtom(uploadGraphAtom, { mode: "promise" });
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
