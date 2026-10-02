import { createEffectCommand } from "../../lib/solid-effect";
import { createSignal, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { toast } from "../../components/ui/toast";
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
import { MatchFailure, MatchTag } from "../../lib";
import * as GraphAccessRuntime from "../../lib/graph-access/runtime";
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import * as GraphAccessCommands from "../../lib/graph-access/commands";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DetachGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const detach = createEffectCommand(GraphAccessCommands.Actions.detach, GraphAccessRuntime.rt);

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

  async function handleDetach() {
    try {
      await detach({
        localGraphId: local.graph.localGraphId,
      });
      setOpen(false);
      toast.success("Graph detached");
    } catch {
      // Error UI is rendered below.
    }
  }

  return (
    <Dialog
      open={open()}
      onOpenChange={(nextOpen) => {
        if (detach.pending()) return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!detach.pending()}>
          <DialogHeader>
            <DialogTitle>Detach synced graph</DialogTitle>
            <DialogDescription>
              This removes the cloud attachment for {local.graph.displayName} on this device. The
              local graph stays available.
            </DialogDescription>
          </DialogHeader>

          <MatchFailure
            exit={detach.exit()}
            onError={(error) => (
              <Alert variant="destructive">
                <AlertDescription>
                  <MatchTag
                    when={error()}
                    fallback="Failed to detach graph."
                    cases={{
                      "GraphAccess.LocalGraphNotFoundError": () =>
                        "That graph is no longer available on this device.",
                    }}
                  />
                </AlertDescription>
              </Alert>
            )}
            onDefect={() => (
              <Alert variant="destructive">
                <AlertDescription>Failed to detach graph.</AlertDescription>
              </Alert>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={detach.pending()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDetach()}
              disabled={detach.pending()}
            >
              Detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
