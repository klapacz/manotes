import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type PurgeDatabaseDialogProps = {
  /** Dialog trigger */
  children: React.ReactNode;
};

export function PurgeDatabaseDialog({ children }: PurgeDatabaseDialogProps) {
  const [open, setOpen] = useState(false);
  
  const purgeDatabase = useMutation(
    trpc.note.purge.mutationOptions({
      onSuccess: () => {
        localStorage.removeItem("lastSync");
        toast("Database purged successfully");
        setOpen(false);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purge Database</DialogTitle>
          <DialogDescription>
            This action will permanently delete all notes from your database. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => purgeDatabase.mutate()}
            disabled={purgeDatabase.isPending}
          >
            {purgeDatabase.isPending ? "Purging..." : "Yes, purge everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}