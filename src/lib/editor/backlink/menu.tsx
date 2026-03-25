import { Effect, flow, Stream, Array, Struct, pipe } from "effect";
import { useEditor } from "prosekit/solid";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopover,
} from "prosekit/solid/autocomplete";
import { createSignal, For } from "solid-js";
import {
  commandEmptyClass,
  commandItemBaseClass,
  commandListClass,
  commandSurfaceClass,
} from "../../../components/ui/command";
import { NoteRepo, createRuntimeStreamStore } from "../..";
import { cx } from "../../cva";
import type { AppExtension } from "../../../editor.extension";
import { suggestDailyNoteIds } from "../../daily-note";

const BACKLINK_REGEX = /\[\[([^\]\n]*)$/u;
const BACKLINK_RESULT_LIMIT = 8;
type BacklinkNote = {
  id: string;
  title: string;
  isDaily: boolean;
};

export default function BacklinkMenu(props: { currentNoteId: string }) {
  const editor = useEditor<AppExtension>();

  const [rawQuery, setRawQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);

  const notes = createRuntimeStreamStore(() => {
    const query = rawQuery();
    if (!open()) return Stream.succeed([]);

    const dailyNotes = pipe(
      suggestDailyNoteIds(query),
      Array.map((note) => ({ ...note, isDaily: true })),
    );

    return NoteRepo.Service.pipe(
      Effect.flatMap((repo) => repo.reactiveSearchPreview(query)),
      Stream.unwrap,
      Stream.map(
        flow(
          Array.prependAll(dailyNotes),
          Array.filter((note) => note.id !== props.currentNoteId),
          Array.take(BACKLINK_RESULT_LIMIT),
          Array.map(Struct.pick("id", "title", "isDaily")),
        ),
      ),
    );
  }, [] as BacklinkNote[]);

  const handleQueryChange = (fallbackQuery: string) => {
    try {
      const view = editor().view;
      const { $from } = view.state.selection;
      const parentOffset = $from.parentOffset;
      const textBeforeCursor = $from.parent.textBetween(
        Math.max(0, parentOffset - 200),
        parentOffset,
      );
      const match = BACKLINK_REGEX.exec(textBeforeCursor);

      setRawQuery((match?.[1] ?? fallbackQuery).trim());
    } catch {
      setRawQuery(fallbackQuery.trim());
    }
  };

  const insertBacklink = (note: BacklinkNote) => {
    editor().view.focus();

    const inserted = editor().commands.insertBacklink({
      id: note.id,
      ...(note.isDaily ? { isDaily: true } : {}),
    });

    if (!inserted) {
      editor().commands.insertText({ text: `[[${note.id}]] ` });
      return;
    }

    editor().commands.insertText({ text: " " });
  };

  const handleValueChange = (value: string) => {
    const note = notes.find((result) => result.id === value);
    if (!note) return;

    // Autocomplete emits valueChange and also runs its internal submit handler.
    // Deferring insertion avoids the submit deletion step removing the node.
    queueMicrotask(() => {
      insertBacklink(note);
    });
  };

  return (
    <AutocompletePopover
      regex={BACKLINK_REGEX}
      class={cx(
        commandSurfaceClass,
        commandListClass,
        "block w-56 border p-1 shadow-md",
      )}
      onOpenChange={setOpen}
      onQueryChange={handleQueryChange}
    >
      <AutocompleteList filter={() => true} onValueChange={handleValueChange}>
        <AutocompleteEmpty class={commandEmptyClass}>
          No matching notes
        </AutocompleteEmpty>

        <For each={notes}>
          {(note) => (
            <AutocompleteItem
              class={cx(
                commandItemBaseClass,
                "data-focused:bg-control-hover data-focused:text-fg",
              )}
              value={note.id}
            >
              {note.title}
            </AutocompleteItem>
          )}
        </For>
      </AutocompleteList>
    </AutocompletePopover>
  );
}
