import { useNavigate } from "@tanstack/solid-router";
import { Effect, Stream } from "effect";
import type { JSX } from "solid-js";
import { Index, createEffect, createSignal, onCleanup } from "solid-js";
import { NoteRepo, createRuntimeStreamStore } from "../lib";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

export const NoteSearchCommand = (props: {
  children?: (open: () => void) => JSX.Element;
}) => {
  const navigate = useNavigate();
  const [noteFilter, setNoteFilter] = createSignal("");
  const [isCommandOpen, setIsCommandOpen] = createSignal(false);

  const noteSearch = createRuntimeStreamStore(
    () => {
      const filter = noteFilter();

      return NoteRepo.Service.pipe(
        Effect.flatMap((repo) => repo.reactiveSearchPreview(filter)),
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
    <>
      {props.children?.(() => setIsCommandOpen(true))}
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
                    // HACK: clear filter after close animation to prevent flickering
                    setTimeout(() => setNoteFilter(""), 200);

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
    </>
  );
};
