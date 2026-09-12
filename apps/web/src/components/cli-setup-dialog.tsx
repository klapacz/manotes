import { useAtom } from "@effect/atom-solid";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Atom } from "effect/unstable/reactivity";
import { splitProps, type ValidComponent } from "solid-js";
import { MatchAsyncResult } from "../lib";
import { CliSetup } from "../lib/graph-access/commands/cli-setup";
import type * as LocalRegistry from "../lib/graph-access/local-registry/schema";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
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
} from "./ui/dialog";
import { Input } from "./ui/input";

type Props<T extends ValidComponent = typeof Button> = {
  readonly graph: LocalRegistry.CloudRecord;
} & DialogTriggerProps<T>;

export function CliSetupDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

  return (
    <Dialog>
      <DialogTrigger {...triggerProps} />
      <DialogPortal>
        <CliSetupContent graph={local.graph} />
      </DialogPortal>
    </Dialog>
  );
}

function CliSetupContent(props: { readonly graph: LocalRegistry.CloudRecord }) {
  // Each opening owns fresh mutation state; creating the atom does not issue a token.
  const prepareAtom = GraphAccessRuntime.atom.fn((graph: LocalRegistry.CloudRecord) =>
    CliSetup.prepare({ graph, origin: window.location.origin }).pipe(
      Effect.provide(FetchHttpClient.layer),
    ),
  );
  const [prepared, prepare] = useAtom(() => prepareAtom);
  const copyAtom = Atom.fn(CliSetup.copy);
  const [copied, copy] = useAtom(() => copyAtom);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Set up CLI</DialogTitle>
        <DialogDescription>
          Prepare an init command for {props.graph.displayName}, then copy and run it in an empty
          directory with the Manotes CLI installed. No encryption password is needed.
        </DialogDescription>
      </DialogHeader>
      <Alert variant="warning">
        <AlertDescription>
          This command contains an account-wide token valid for 30 days and this graph's encryption
          key. Keep it private. The leading space only skips shell history when your shell is
          configured to ignore it. Token expiry or a graph password change does not invalidate the
          copied graph key.
        </AlertDescription>
      </Alert>
      <MatchAsyncResult
        when={prepared()}
        onFailure={() => (
          <p role="alert">Could not prepare the command. Check your connection and sign-in.</p>
        )}
        onSuccess={(command) => (
          <Input
            aria-label="CLI init command"
            readonly
            value={command()}
            class="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      />
      <MatchAsyncResult
        when={copied()}
        onSuccess={() => (
          <Alert variant="success">
            <AlertDescription>Copied</AlertDescription>
          </Alert>
        )}
        onFailure={() => (
          <p role="alert">Could not copy. Try again or copy the command manually.</p>
        )}
      />
      <DialogFooter>
        <MatchAsyncResult
          when={prepared()}
          fallback={
            <Button disabled={prepared().waiting} onClick={() => prepare(props.graph)}>
              {prepared().waiting ? "Preparing..." : "Prepare init command"}
            </Button>
          }
          onSuccess={(command) => (
            // A separate click keeps clipboard access within a fresh user gesture.
            <Button disabled={copied().waiting} onClick={() => copy(command())}>
              {copied().waiting ? "Copying..." : "Copy init command"}
            </Button>
          )}
        />
      </DialogFooter>
    </DialogContent>
  );
}
