import { useNavigate } from "@tanstack/solid-router";
import { Stream, Array, flow } from "effect";
import { For, createSignal, onSettled } from "solid-js";
import type { JSX } from "@solidjs/web";
import { NoteRepo, type NoteSchema, bindRt, createAtomState, createAtomStore } from "../lib";
import { NoteFormat } from "../lib/note";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import * as NoteLink from "../lib/note/link";

export const NoteSearchCommand = (props: { children?: (open: () => void) => JSX.Element }) => {
  const navigate = useNavigate();
  const [noteFilter, setNoteFilter, noteFilterAtom] = createAtomState("");
  const [isCommandOpen, setIsCommandOpen] = createSignal(false);
  let opener: HTMLElement | undefined;

  const setOpen = (open: boolean) => {
    if (open && !isCommandOpen()) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    }

    setIsCommandOpen(open);
  };

  const notes = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const filter = get(noteFilterAtom);

        return NoteRepo.Service.use((repo) => repo.reactiveSearchPreview(filter)).pipe(
          Stream.unwrap,
          Stream.map(
            flow(
              Array.map((note) => ({
                id: note.id,
                title: NoteFormat.label(note),
              })),
            ),
          ),
        );
      }),
    ),
    Array.empty<{ id: NoteSchema.Id; title: string }>(),
  );

  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;

      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      setOpen(!isCommandOpen());
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <>
      {props.children?.(() => setOpen(true))}
      <CommandDialog
        open={isCommandOpen()}
        onOpenChange={setOpen}
        shouldFilter={false}
        onCloseAutoFocus={(event) => {
          // The keyboard palette has no Dialog.Trigger. Restore its actual opener
          // at normal teardown; ProseMirror keeps its live mapped selection.
          event.preventDefault();
          opener?.focus({ preventScroll: true });
        }}
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
            <For each={notes.value} keyed={false}>
              {(note) => (
                <CommandItem
                  value={note().id}
                  onSelect={() => {
                    // Selecting a result hands focus to the destination, not the opener.
                    opener = undefined;
                    setIsCommandOpen(false);
                    // HACK: clear filter after close animation to prevent flickering
                    setTimeout(() => setNoteFilter(""), 200);

                    void navigate(NoteLink.getOptions({ id: note().id }));
                  }}
                >
                  {note().title}
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
