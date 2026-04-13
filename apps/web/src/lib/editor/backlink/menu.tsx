import { flow, Stream, Array, pipe, Struct } from "effect";
import { useEditor } from "prosekit/solid";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopover,
} from "prosekit/solid/autocomplete";
import { createSignal, For, Show } from "solid-js";
import {
  CommandLabel,
  commandEmptyClass,
  commandItemBaseClass,
  commandListClass,
  commandSurfaceClass,
} from "../../../components/ui/command";
import { NoteRepo, createRuntimeStreamStore, useRuntime } from "../..";
import { cx } from "../../cva";
import type { AppExtension } from "../../../editor.extension";
import { suggestDailyNoteIds } from "../../daily-note";
import * as BrowserExtensionClient from "../../browser-extension/client";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";
import * as BrowserExtension from "@manotes/shared/browser-extension/contract";

const BACKLINK_REGEX = /\[\[([^\]\n]*)$/u;

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

    return NoteRepo.Service.use((repo) => repo.reactiveSearchPreview(query)).pipe(
      Stream.unwrap,
      Stream.map(
        flow(
          Array.prependAll(dailyNotes),
          Array.filter((note) => note.id !== props.currentNoteId),
          Array.map(Struct.pick(["id", "title", "isDaily"])),
        ),
      ),
    );
  }, [] as BacklinkNote[]);

  const tabs = createRuntimeStreamStore(
    () =>
      open()
        ? BrowserExtensionClient.watchTabs
        : Stream.succeed([] as BrowserExtension.TabCandidate[]),
    [] as BrowserExtension.TabCandidate[],
  );

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

  const onSelect = (note: BacklinkNote) => {
    // Autocomplete emits valueChange and also runs its internal submit handler.
    // Deferring insertion avoids the submit deletion step removing the node.
    queueMicrotask(() => {
      insertBacklink(note);
    });
  };

  const runtime = useRuntime();
  const onTabSelect = async (tab: BrowserExtension.TabCandidate) => {
    const note = await runtime().runPromise(
      BrowserExtensionTabNoteService.Service.use((service) => service.createFromTab(tab)),
    );

    onSelect(note);
  };

  return (
    <AutocompletePopover
      regex={BACKLINK_REGEX}
      class={cx(commandSurfaceClass, commandListClass, "block w-56 border p-1 shadow-md")}
      onOpenChange={setOpen}
      onQueryChange={handleQueryChange}
    >
      <AutocompleteList filter={() => true}>
        <AutocompleteEmpty class={commandEmptyClass}>No matching notes or tabs</AutocompleteEmpty>

        <Show when={notes.length > 0}>
          <CommandLabel>Notes</CommandLabel>

          <For each={notes}>
            {(note) => (
              <AutocompleteItem
                class={cx(
                  commandItemBaseClass,
                  "data-focused:bg-control-hover data-focused:text-fg",
                )}
                onSelect={() => onSelect(note)}
                value={note.id}
              >
                {note.title}
              </AutocompleteItem>
            )}
          </For>
        </Show>

        <Show when={tabs.length > 0}>
          <CommandLabel>Tabs</CommandLabel>
          <For each={tabs}>
            {(tab) => (
              <AutocompleteItem
                class={cx(
                  commandItemBaseClass,
                  "data-focused:bg-control-hover data-focused:text-fg",
                )}
                onSelect={() => onTabSelect(tab)}
                value={tab.id.toString()}
              >
                <div class="min-w-0">
                  <div class="truncate">{tab.title}</div>
                  <div class="truncate text-xs text-fg-subtle">{tab.url}</div>
                </div>
              </AutocompleteItem>
            )}
          </For>
        </Show>
      </AutocompleteList>
    </AutocompletePopover>
  );
}
