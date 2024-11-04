import { sqlocal } from "@/sqlocal/client";
import { migrator } from "@/sqlocal/migrator";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useState, useRef, type PropsWithChildren } from "react";
import { DialogHeader, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "sonner";

type ImportDatabaseDialogProps = {
  /** Dialog trigger */
  children: React.ReactNode;
};

export function ImportDatabaseDialog({ children }: ImportDatabaseDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importDatabase = useMutation({
    mutationFn: async (file: File) => {
      await sqlocal.overwriteDatabaseFile(file);
      const { error } = await migrator.migrateToLatest();

      if (error) {
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (error) => {
      toast.error("Importing database failed");
      console.log(error);
    },
    onSuccess: () => {
      setOpen(false);
    },
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      importDatabase.mutate(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Database</DialogTitle>
          <DialogDescription>
            Upload a database file to replace your current database. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            type="file"
            accept=".sqlite3,.db"
            ref={fileInputRef}
            disabled={importDatabase.isPending}
          />
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={importDatabase.isPending}>
              {importDatabase.isPending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
