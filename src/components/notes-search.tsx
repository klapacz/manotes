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
import { NoteService } from "@/services/note.service";
import { DialogTitle } from "./ui/dialog";
import { useNavigateToNote } from "@/hooks/use-navigate-to-note";
import { useNotesSearchDialog } from "@/contexts/notes-search-dialog-context";

export function NotesSearchCommandDialog() {
  const navigateToNote = useNavigateToNote();
  const { open, setOpen } = useNotesSearchDialog();
  const [query, setQuery] = React.useState("");

  const { data } = useQuery(noteSearchOptions(query));

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  const [value, setValue] = React.useState<string>();

  /**
   * Preselect the first item in the list, when the items array change.
   */
  React.useEffect(() => {
    if (data?.length ?? 0 > 0) {
      setValue(data?.[0]?.id);
    } else {
      setValue(":add:");
    }
  }, [data, query]);

  function cleanup() {
    setOpen(false);
    setQuery("");
  }

  const createNoteMutation = useMutation({
    mutationFn: async (title: string) => {
      const note = await NoteService.create({ title: title.trim() });
      return note;
    },
    onSuccess: (note) => {
      navigateToNote(note);
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
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandGroup heading="Notes">
          <CommandEmpty>No results found.</CommandEmpty>
          {data?.map((note) => (
            <CommandItem
              key={note.id}
              value={note.id}
              onSelect={() => {
                navigateToNote(note);
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
              createNoteMutation.mutate(query);
            }}
            value=":add:"
          >
            Create new note {query.trim() ? <>'{query.trim()}'</> : null}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
