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
import * as GraphAccessCommands from "../../lib/graph-access/commands";
import * as LocalRegistry from "../../lib/graph-access/local-registry";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DeleteGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);
  const [deleteResult, deleteLocalGraph] = useAtom(GraphAccessCommands.Atom.deleteLocal, {
    mode: "promise",
  });
  const [local, triggerProps] = splitProps(props as Props, ["graph"]);

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
        if (deleteResult().waiting) return;
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger {...triggerProps} />

      <DialogPortal>
        <DialogContent showCloseButton={!deleteResult().waiting}>
          <DialogHeader>
            <DialogTitle>Delete graph</DialogTitle>
            <DialogDescription>
              Permanently delete {local.graph.displayName} from this device?
            </DialogDescription>
          </DialogHeader>

          <MatchAsyncResult
            when={deleteResult()}
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
              disabled={deleteResult().waiting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteResult().waiting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
