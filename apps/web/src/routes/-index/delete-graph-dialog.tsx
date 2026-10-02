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
import * as GraphAccessCommands from "../../lib/graph-access/commands";
import * as LocalRegistry from "../../lib/graph-access/local-registry";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DeleteGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const deleteLocalGraph = createEffectCommand(
    GraphAccessCommands.Actions.deleteLocal,
    GraphAccessRuntime.rt,
  );

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

  async function handleDelete() {
    try {
      await deleteLocalGraph(local.graph.localGraphId);
      setOpen(false);
      toast.success("Graph deleted");
    } catch {
      // Error UI is rendered below.
    }
  }

  return (
    <Dialog
      open={open()}
      onOpenChange={(nextOpen) => {
        if (deleteLocalGraph.pending()) return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!deleteLocalGraph.pending()}>
          <DialogHeader>
            <DialogTitle>Delete graph</DialogTitle>
            <DialogDescription>
              Permanently delete {local.graph.displayName} from this device?
            </DialogDescription>
          </DialogHeader>

          <MatchFailure
            exit={deleteLocalGraph.exit()}
            onError={(error) => (
              <Alert variant="destructive">
                <AlertDescription>
                  <MatchTag
                    when={error()}
                    fallback="Failed to delete graph."
                    cases={{
                      "GraphAccessCommandsDelete.LockTimeout": () =>
                        "Timed out waiting for another tab to close this graph.",
                    }}
                  />
                </AlertDescription>
              </Alert>
            )}
            onDefect={() => (
              <Alert variant="destructive">
                <AlertDescription>Failed to delete graph.</AlertDescription>
              </Alert>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleteLocalGraph.pending()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteLocalGraph.pending()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
