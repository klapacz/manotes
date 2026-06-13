import { Effect, flow, Stream, Array, Struct } from "effect";
import { useEditor } from "prosekit/solid";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopover,
} from "prosekit/solid/autocomplete";
import { For, Show } from "solid-js";
import {
  CommandLabel,
  commandEmptyClass,
  commandItemBaseClass,
  commandListClass,
  commandSurfaceClass,
} from "../../../components/ui/command";
import { NoteRepo, bindRt, createAtomState, createAtomStore, createSyncedAtom } from "../..";
import { cx } from "../../cva";
import type { AppExtension } from "../../../editor.extension";
import * as BrowserExtensionClient from "../../browser-extension/client";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";
import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { useAtom } from "@effect/atom-solid";

const BACKLINK_REGEX = /\[\[([^\]\n]*)$/u;

type BacklinkNote = {
  id: string;
  title: string;
};

const CreateTabNote = bindRt((rt) =>
  rt.fn(
    Effect.fn("LibEditorBacklinkMenu.createTabNote")(function* (
      tab: BrowserExtension.TabCandidate,
    ) {
      const service = yield* BrowserExtensionTabNoteService.Service;
      return yield* service.createFromTab(tab);
    }),
  ),
);

export default function BacklinkMenu(props: { currentNoteId: string }) {
  const editor = useEditor<AppExtension>();

  const [, setRawQuery, rawQueryAtom] = createAtomState("");
  const currentNoteIdAtom = createSyncedAtom(() => props.currentNoteId);
  const [, setOpen, openAtom] = createAtomState(false);

  const notes = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const query = get(rawQueryAtom);
        const currentNoteId = get(currentNoteIdAtom);
        if (!get(openAtom)) return Stream.succeed([] as BacklinkNote[]);

        return NoteRepo.Service.use((repo) => repo.reactiveSearchPreview(query)).pipe(
          Stream.unwrap,
          Stream.map(
            flow(
              Array.filter((note) => note.id !== currentNoteId),
              Array.map(Struct.pick(["id", "title"])),
            ),
          ),
        );
      }),
    ),
    [] as BacklinkNote[],
  );

  const tabs = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) =>
        get(openAtom)
          ? BrowserExtensionClient.watchTabs
          : Stream.succeed([] as BrowserExtension.TabCandidate[]),
      ),
    ),
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

  const [, createTabNote] = useAtom(CreateTabNote, { mode: "promise" });

  const onTabSelect = async (tab: BrowserExtension.TabCandidate) => {
    try {
      const note = await createTabNote(tab);
      onSelect(note);
    } catch {}
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

        <Show when={notes.value.length > 0}>
          <CommandLabel>Notes</CommandLabel>

          <For each={notes.value}>
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

        <Show when={tabs.value.length > 0}>
          <CommandLabel>Tabs</CommandLabel>
          <For each={tabs.value}>
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
