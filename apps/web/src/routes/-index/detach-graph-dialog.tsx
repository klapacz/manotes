import type { ValidComponent } from "@solidjs/web";
import { useAtom } from "../../lib/atom-solid";
import { Exit } from "effect";
import { createSignal, omit } from "solid-js";
import { toast } from "../../components/ui/sonner";
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
import { MatchAsyncResult, MatchTag } from "../../lib";
import { LocalRegistry } from "../../lib/graph-access/local-registry";
import { GraphAccessCommands } from "../../lib/graph-access/commands";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DetachGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const [detachResult, detach] = useAtom(() => GraphAccessCommands.Atom.detach, {
    mode: "promiseExit",
  });

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

  async function handleDetach() {
    const exit = await detach({ localGraphId: local.graph.localGraphId });

    if (Exit.isFailure(exit)) return;

    setOpen(false);
    toast.success("Graph detached");
  }

  return (
    <Dialog
      open={open()}
      onOpenChange={(nextOpen) => {
        if (detachResult().waiting) return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!detachResult().waiting}>
          <DialogHeader>
            <DialogTitle>Detach synced graph</DialogTitle>
            <DialogDescription>
              This removes the cloud attachment for {local.graph.displayName} on this device. The
              local graph stays available.
            </DialogDescription>
          </DialogHeader>

          <MatchAsyncResult
            when={detachResult()}
            onError={(error) => (
              <Alert variant="destructive">
                <AlertDescription>
                  <MatchTag
                    when={error()}
                    fallback="Failed to detach graph."
                    cases={{
                      "GraphAccess.LocalGraphNotFoundError": () => {
                        return "That graph is no longer available on this device.";
                      },
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
              disabled={detachResult().waiting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDetach()}
              disabled={detachResult().waiting}
            >
              Detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
