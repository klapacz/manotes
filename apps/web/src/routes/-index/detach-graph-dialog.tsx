import { useAtom } from "@effect/atom-solid";
import { createSignal, splitProps, type ValidComponent } from "solid-js";
import { toast } from "somoto";
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
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import * as GraphAccessPromotion from "../../lib/graph-access/promotion";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DetachGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);
  const [detachResult, detach] = useAtom(GraphAccessPromotion.Atom.detach, {
    mode: "promise",
  });
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

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
