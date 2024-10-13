import { sqlocal } from "@/sqlocal/client";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogFooter } from "./ui/dialog";

export type ExportDatabaseDialogProps = {
  /** Dialog trigger */
  children: React.ReactNode;
};

export function ExportDatabaseDialog({ children }: ExportDatabaseDialogProps) {
  const [open, setOpen] = useState(false);
  const getDatabaseFile = useMutation({
    mutationFn: async () => {
      const databaseFile = await sqlocal.getDatabaseFile();
      const fileUrl = URL.createObjectURL(databaseFile);
      return fileUrl;
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Database</DialogTitle>
          <DialogDescription>
            Download your database file. This file contains all your notes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {getDatabaseFile.data ? (
            <Button asChild>
              <a href={getDatabaseFile.data} download="database.sqlite3">
                Download database
              </a>
            </Button>
          ) : (
            <Button
              onClick={() => getDatabaseFile.mutate()}
              disabled={getDatabaseFile.isPending}
            >
              {getDatabaseFile.isPending ? "Preparing..." : "Export"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
