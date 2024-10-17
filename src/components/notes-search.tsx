import React from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { useMutation, useQuery } from "@tanstack/react-query";
import { noteSearchOptions } from "@/lib/query/notes";
import { useNavigate } from "@tanstack/react-router";
import { NoteService } from "@/services/note.service";
import { DialogTitle } from "./ui/dialog";

export function NotesSearchCommandDialog() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const navigate = useNavigate();

  const { data } = useQuery(noteSearchOptions(search));

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  /**
   * This is used to preselect the first item in the list, when the items array change.
   */
  const [value, setValue] = React.useState<string>();
  React.useEffect(() => {
    setValue(data?.[0]?.id);
  }, [data]);

  function cleanup() {
    setOpen(false);
    setSearch("");
  }

  const createNoteMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!title.trim()) {
        throw new Error("Note must have title");
      }
      const note = await NoteService.create({ title: title.trim() });
      return note;
    },
    onSuccess: (note) => {
      navigate({
        to: "/notes/$noteId",
        params: {
          noteId: note.id,
        },
      });

      cleanup();
    },
    onError(error) {
      console.log(error);
    },
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      commandProps={{
        shouldFilter: false,
        value,
        onValueChange: setValue,
      }}
    >
      <DialogTitle className="sr-only">Search notes</DialogTitle>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandGroup heading="Notes">
          <CommandEmpty>No results found.</CommandEmpty>
          {data?.map((note) => (
            <CommandItem
              key={note.id}
              value={note.id}
              onSelect={() => {
                if (note.daily_at) {
                  navigate({
                    to: "/",
                    search: {
                      date: note.daily_at,
                    },
                  });
                } else {
                  navigate({
                    to: "/notes/$noteId",
                    params: {
                      noteId: note.id,
                    },
                  });
                }

                cleanup();
              }}
            >
              {note.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              createNoteMutation.mutate(search);
            }}
          >
            Create new note {search.trim() ? <>'{search.trim()}'</> : null}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
