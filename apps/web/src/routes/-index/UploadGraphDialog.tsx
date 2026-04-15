import { useAtom } from "@effect/atom-solid";
import { Navigate } from "@tanstack/solid-router";
import { Effect, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type { FnContext } from "effect/unstable/reactivity/Atom";
import { createSignal, Show, splitProps, type ValidComponent } from "solid-js";
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
import { Form } from "../../components/ui/form";
import { TextField, TextFieldInput, TextFieldLabel } from "../../components/ui/text-field";
import { Runtime } from "../../lib";
import * as GraphAccessErrors from "../../lib/graph-access/errors";
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import * as RemoteRegistryClient from "../../lib/graph-access/remote-registry/client";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as Session from "../../lib/graph-access/session";

type UploadGraphInput = {
  password: string;
  localGraphId: string;
};

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

    yield* Effect.tryPromise(() =>
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
  const [password, setPassword] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [uploadGraphResult, uploadGraph] = useAtom(uploadGraphAtom);
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

  function handleSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();

    const normalizedPassword = GraphEncryption.normalizePassword(password());
    if (!normalizedPassword) return setValidationError("Password is required.");

    setValidationError(null);
    uploadGraph({
      localGraphId: props.graph.localGraphId,
      password: normalizedPassword,
    });
  }

  return (
    <Dialog
      open={open()}
      onOpenChange={(open) => {
        if (uploadGraphResult().waiting) return;
        if (open) {
          setValidationError(null);
          setPassword("");
        }
        setOpen(open);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!uploadGraphResult().waiting}>
          <Form spacing="compact" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Upload graph</DialogTitle>
              <DialogDescription>
                Enter a password to encrypt and sync {local.graph.displayName}.
              </DialogDescription>
            </DialogHeader>

            <TextField>
              <TextFieldLabel for="upload-graph-password">Password</TextFieldLabel>
              <TextFieldInput
                id="upload-graph-password"
                type="password"
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
                placeholder="Required to upload this graph"
                autofocus
                disabled={uploadGraphResult().waiting}
              />
            </TextField>

            <Show when={validationError()}>
              {(error) => (
                <Alert variant="destructive">
                  <AlertDescription>{error()}</AlertDescription>
                </Alert>
              )}
            </Show>

            {AsyncResult.matchWithError(uploadGraphResult(), {
              onInitial: () => null,
              onSuccess: (graph) => (
                <Navigate to="/$graph" params={{ graph: graph.value.localGraphId }} />
              ),
              onError: (error) => (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error._tag === "GraphAccess.LocalGraphNotFoundError"
                      ? "That graph is no longer available on this device."
                      : error._tag === "GraphAccess.LocalGraphAlreadySyncedError"
                        ? "That graph is already synced."
                        : error._tag === "GraphRegistry.DisplayNameTakenError"
                          ? "A synced graph with that name already exists."
                          : "Failed to upload graph."}
                  </AlertDescription>
                </Alert>
              ),
              onDefect: () => (
                <Alert variant="destructive">
                  <AlertDescription>Failed to upload graph.</AlertDescription>
                </Alert>
              ),
            })}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={uploadGraphResult().waiting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploadGraphResult().waiting}>
                Upload graph
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
