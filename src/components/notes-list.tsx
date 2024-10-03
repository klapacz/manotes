import { db, sqlocal } from "@/sqlocal/client";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Editor } from "./Editor";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { useRef, useState } from "react";
import { Input } from "./ui/input";
import { migrator } from "@/sqlocal/migrator";
import { sql } from "kysely";

export function NotesList() {
  const queryClient = useQueryClient();

  const { data: notes } = useSuspenseQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      return await db
        .selectFrom("notes")
        .orderBy("notes.title", "asc")
        .select(["notes.id", "notes.title"])
        .execute();
    },
    staleTime: Infinity, // The data will never become stale
    gcTime: Infinity, // The data will never be removed from the cache
    refetchOnWindowFocus: false, // Prevent refetching when the window regains focus
    refetchOnReconnect: false, // Prevent refetching when the network reconnects
  });

  const createNote = useMutation({
    mutationFn: async () => {
      await db
        .insertInto("notes")
        .values({
          content: "",
        })
        .execute();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  return (
    <div>
      <div className="space-y-4 mb-6">
        <h1 className="text-3xl">Notes</h1>
        <div className="flex items-center space-x-4">
          <Button onClick={() => createNote.mutate()}>Create</Button>
          <ExportDatabaseButton />
          <ImportDatabaseButton />
        </div>
      </div>
      <ul>
        {notes.map((note) => (
          <Editor key={note.id} noteId={note.id} />
        ))}
      </ul>
    </div>
  );
}

function ImportDatabaseButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importDatabase = useMutation({
    mutationFn: async (file: File) => {
      await sqlocal.overwriteDatabaseFile(file);
      await migrator.migrateToLatest();
      queryClient.invalidateQueries({ queryKey: ["notes"] });
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
      <DialogTrigger asChild>
        <Button variant="secondary">Import database</Button>
      </DialogTrigger>
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
            accept=".sqlite3"
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

function ExportDatabaseButton() {
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
      <DialogTrigger asChild>
        <Button variant="secondary">Export database</Button>
      </DialogTrigger>
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
