import { Effect, Exit } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Show, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { createEffectCommand } from "../lib/solid-effect";
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
  // SAFETY: Solid's splitProps cannot preserve Kobalte's polymorphic component parameter
  // through the Props<T> intersection; the cast changes no runtime properties and only
  // removes the local `graph` key from the trigger prop bag.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

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
  // Each opening owns fresh command state; creating it does not issue a token.
  const prepare = createEffectCommand(
    (graph: LocalRegistry.CloudRecord) =>
      CliSetup.prepare({ graph, origin: window.location.origin }).pipe(
        Effect.provide(FetchHttpClient.layer),
      ),
    GraphAccessRuntime.rt,
  );

  const copy = createEffectCommand(CliSetup.copy);

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
      <Show when={prepare.error()}>
        <p role="alert">Could not prepare the command. Check your connection and sign-in.</p>
      </Show>
      <Show when={prepare.value()}>
        {(command) => (
          <Input
            aria-label="CLI init command"
            readonly
            value={command()}
            class="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </Show>
      <Show when={copy.exit()}>
        {(exit) => (
          <Show
            when={Exit.isSuccess(exit())}
            fallback={<p role="alert">Could not copy. Try again or copy the command manually.</p>}
          >
            <Alert variant="success">
              <AlertDescription>Copied</AlertDescription>
            </Alert>
          </Show>
        )}
      </Show>
      <DialogFooter>
        <Show
          when={prepare.value()}
          fallback={
            <Button
              disabled={prepare.pending()}
              onClick={() => void prepare(props.graph).catch(() => {})}
            >
              {prepare.pending() ? "Preparing..." : "Prepare init command"}
            </Button>
          }
        >
          {(command) => (
            // A separate click keeps clipboard access within a fresh user gesture.
            <Button disabled={copy.pending()} onClick={() => void copy(command()).catch(() => {})}>
              {copy.pending() ? "Copying..." : "Copy init command"}
            </Button>
          )}
        </Show>
      </DialogFooter>
    </DialogContent>
  );
}
