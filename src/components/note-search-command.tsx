import { useNavigate } from "@tanstack/solid-router";
import { Effect, Stream } from "effect";
import { Index, createEffect, createSignal, onCleanup } from "solid-js";
import { NoteRepo, createRuntimeStreamStore } from "../lib";
import { Button } from "./ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

export const NoteSearchCommand = () => {
  const navigate = useNavigate();
  const [noteFilter, setNoteFilter] = createSignal("");
  const [isCommandOpen, setIsCommandOpen] = createSignal(false);

  const noteSearch = createRuntimeStreamStore(
    () => {
      const filter = noteFilter();

      return NoteRepo.Service.pipe(
        Effect.flatMap((repo) => repo.reactiveSearch(filter)),
        Stream.unwrap,
        Stream.map((notes) => ({
          notes: notes.map((note) => ({ id: note.id, title: note.title })),
        })),
      );
    },
    { notes: [] as Array<{ id: string; title: string }> },
  );

  createEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      setIsCommandOpen((open) => !open);
    };

    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <div class="mb-3 px-1">
      <Button
        variant="outline"
        class="text-fg-subtle w-full justify-between font-normal"
        onClick={() => setIsCommandOpen(true)}
      >
        Search notes...
        <span class="text-xs">Ctrl+K</span>
      </Button>
      <CommandDialog
        open={isCommandOpen()}
        onOpenChange={setIsCommandOpen}
        shouldFilter={false}
      >
        <CommandInput
          value={noteFilter()}
          onValueChange={(next) => {
            setNoteFilter(next);
          }}
          placeholder="Search notes..."
        />
        <CommandList>
          <CommandEmpty>No matching notes.</CommandEmpty>
          <CommandGroup heading="Notes">
            <Index each={noteSearch.notes}>
              {(note) => (
                <CommandItem
                  value={note().id}
                  onSelect={() => {
                    setIsCommandOpen(false);
                    setNoteFilter("");
                    void navigate({
                      from: "/$graph",
                      to: "/$graph/note/$note",
                      params: { note: note().id },
                    });
                  }}
                >
                  {note().title}
                </CommandItem>
              )}
            </Index>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
};
