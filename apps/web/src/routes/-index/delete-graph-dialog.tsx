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
import { GraphAccessCommands } from "../../lib/graph-access/commands";
import { LocalRegistry } from "../../lib/graph-access/local-registry";

type Props<T extends ValidComponent = typeof Button> = {
  graph: LocalRegistry.Schema.Record;
} & DialogTriggerProps<T>;

export function DeleteGraphDialog<T extends ValidComponent = typeof Button>(props: Props<T>) {
  const [open, setOpen] = createSignal(false);

  const [deleteResult, deleteLocalGraph] = useAtom(() => GraphAccessCommands.Atom.deleteLocal, {
    mode: "promiseExit",
  });

  // SAFETY: Erasing the trigger's polymorphic parameter lets Solid remove graph; remaining props are forwarded unchanged to DialogTrigger.
  const local = props as Props;
  const triggerProps = omit(local, "graph");

  async function handleDelete() {
    const exit = await deleteLocalGraph(local.graph.localGraphId);

    if (Exit.isFailure(exit)) return;

    setOpen(false);
    toast.success("Graph deleted");
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
                      "GraphAccessCommandsDelete.LockTimeout": () => {
                        return "Timed out waiting for another tab to close this graph.";
                      },
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
