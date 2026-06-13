import { useNavigate } from "@tanstack/solid-router";
import { Stream, Array, flow } from "effect";
import type { JSX } from "solid-js";
import { Index, createEffect, createSignal, onCleanup } from "solid-js";
import { NoteRepo, bindRt, createAtomState, createAtomStore } from "../lib";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

export const NoteSearchCommand = (props: { children?: (open: () => void) => JSX.Element }) => {
  const navigate = useNavigate();
  const [noteFilter, setNoteFilter, noteFilterAtom] = createAtomState("");
  const [isCommandOpen, setIsCommandOpen] = createSignal(false);

  const notes = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const filter = get(noteFilterAtom);

        return NoteRepo.Service.use((repo) => repo.reactiveSearchPreview(filter)).pipe(
          Stream.unwrap,
          Stream.map(flow(Array.map((note) => ({ id: note.id, title: note.title })))),
        );
      }),
    ),
    [] as { id: string; title: string }[],
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
      <CommandDialog open={isCommandOpen()} onOpenChange={setIsCommandOpen} shouldFilter={false}>
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
            <Index each={notes.value}>
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
