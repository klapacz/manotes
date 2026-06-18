import { Effect, flow, Stream, Array, Struct } from "effect";
import { useEditor } from "prosekit/solid";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopover,
} from "prosekit/solid/autocomplete";
import { For, Show, onCleanup, onMount } from "solid-js";
import {
  commandEmptyClass,
  commandItemBaseClass,
  commandListClass,
  commandSurfaceClass,
} from "../../../components/ui/command";
import { NoteCreate } from "../../../components/note/note-create";
import { NoteRepo, bindRt, createAtomState, createAtomStore, createSyncedAtom } from "../..";
import { cx } from "../../cva";
import { NoteFormat } from "../../note";
import type { AppExtension } from "../../../editor.extension";
import * as BrowserExtensionClient from "../../browser-extension/client";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";
import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { useAtom } from "@effect/atom-solid";

const BACKLINK_REGEX = /\[\[([^\]\n]*)$/u;
const TAB_REGEX = /\[@([^\]\n]*)$/u;

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
  const onSelect = createBacklinkInsertion(editor);

  const [query, setRawQuery, rawQueryAtom] = createAtomState("");
  const currentNoteIdAtom = createSyncedAtom(() => props.currentNoteId);
  const [isOpen, setOpen, openAtom] = createAtomState(false);
  useArrowKeyAliases(editor, isOpen);

  const createNote = NoteCreate.useCreateNote();

  const onCreatePage = (title: string) =>
    createNote({ payload: NoteCreate.pagePayload(title) }, (note) =>
      onSelect({ id: note.id, title: NoteFormat.label(note) }),
    );

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
              Array.map((note) => ({
                ...note,
                title: NoteFormat.label(note),
              })),
              Array.map(Struct.pick(["id", "title"])),
            ),
          ),
        );
      }),
    ),
    [] as BacklinkNote[],
  );

  return (
    <AutocompletePopover
      regex={BACKLINK_REGEX}
      class={cx(commandSurfaceClass, commandListClass, "block w-56 border p-1 shadow-md")}
      onOpenChange={setOpen}
      onQueryChange={makeQueryHandler(editor, BACKLINK_REGEX, setRawQuery)}
    >
      <AutocompleteList filter={() => true}>
        <AutocompleteEmpty class={commandEmptyClass}>No matching notes</AutocompleteEmpty>

        <For each={notes.value}>
          {(note) => (
            <AutocompleteItem
              class={cx(commandItemBaseClass, "data-focused:bg-control-hover data-focused:text-fg")}
              onSelect={() => onSelect(note)}
              value={note.id}
            >
              {note.title}
            </AutocompleteItem>
          )}
        </For>

        {/* Keyed so the item is recreated on each query change: the prosekit
            solid wrapper renders children via solid-js/h and does not track
            dynamic text children reactively after first render. */}
        <Show when={query().trim()} keyed>
          {(title) => (
            <AutocompleteItem
              class={cx(commandItemBaseClass, "data-focused:bg-control-hover data-focused:text-fg")}
              onSelect={() => onCreatePage(title)}
              value={`create:${title}`}
            >
              Create page “{title}”
            </AutocompleteItem>
          )}
        </Show>
      </AutocompleteList>
    </AutocompletePopover>
  );
}

export function TabMenu() {
  const editor = useEditor<AppExtension>();
  const onSelect = createBacklinkInsertion(editor);

  const [, setRawQuery, rawQueryAtom] = createAtomState("");
  const [isOpen, setOpen, openAtom] = createAtomState(false);
  useArrowKeyAliases(editor, isOpen);

  const tabs = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const query = get(rawQueryAtom);
        if (!get(openAtom)) return Stream.succeed([] as BrowserExtension.TabCandidate[]);

        return BrowserExtensionClient.watchTabs.pipe(Stream.map(filterTabs(query)));
      }),
    ),
    [] as BrowserExtension.TabCandidate[],
  );

  const [, createTabNote] = useAtom(CreateTabNote, { mode: "promise" });

  const onTabSelect = async (tab: BrowserExtension.TabCandidate) => {
    try {
      const note = await createTabNote(tab);
      onSelect({ id: note.id, title: NoteFormat.label(note) });
    } catch {}
  };

  return (
    <AutocompletePopover
      regex={TAB_REGEX}
      class={cx(commandSurfaceClass, commandListClass, "block w-56 border p-1 shadow-md")}
      onOpenChange={setOpen}
      onQueryChange={makeQueryHandler(editor, TAB_REGEX, setRawQuery)}
    >
      <AutocompleteList filter={() => true}>
        <AutocompleteEmpty class={commandEmptyClass}>No matching tabs</AutocompleteEmpty>

        <For each={tabs.value}>
          {(tab) => (
            <AutocompleteItem
              class={cx(commandItemBaseClass, "data-focused:bg-control-hover data-focused:text-fg")}
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
      </AutocompleteList>
    </AutocompletePopover>
  );
}

type AppEditor = ReturnType<typeof useEditor<AppExtension>>;

function createBacklinkInsertion(editor: AppEditor) {
  const insertBacklink = (note: BacklinkNote) => {
    editor().view.focus();

    const inserted = editor().commands.insertBacklink({ id: note.id });

    if (!inserted) {
      editor().commands.insertText({ text: `[[${note.id}]] ` });
      return;
    }

    editor().commands.insertText({ text: " " });
  };

  // Autocomplete emits valueChange and also runs its internal submit handler.
  // Deferring insertion avoids the submit deletion step removing the node.
  return (note: BacklinkNote) => queueMicrotask(() => insertBacklink(note));
}

// The listbox navigates on ArrowDown/ArrowUp keydown events forwarded through
// ProseMirror. Alias Ctrl-N / Ctrl-P to those keys while the popover is open.
function useArrowKeyAliases(editor: AppEditor, isOpen: () => boolean) {
  onMount(() => {
    const dom = editor().view.dom;
    const handler = (event: KeyboardEvent) => {
      if (!isOpen() || !event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const aliased = key === "n" ? "ArrowDown" : key === "p" ? "ArrowUp" : null;
      if (!aliased) return;
      event.preventDefault();
      dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: aliased, bubbles: true, cancelable: true }),
      );
    };
    dom.addEventListener("keydown", handler, { capture: true });
    onCleanup(() => dom.removeEventListener("keydown", handler, { capture: true }));
  });
}

function makeQueryHandler(editor: AppEditor, regex: RegExp, setRawQuery: (query: string) => void) {
  return (fallbackQuery: string) => {
    try {
      const view = editor().view;
      const { $from } = view.state.selection;
      const parentOffset = $from.parentOffset;
      const textBeforeCursor = $from.parent.textBetween(
        Math.max(0, parentOffset - 200),
        parentOffset,
      );
      const match = regex.exec(textBeforeCursor);

      setRawQuery((match?.[1] ?? fallbackQuery).trim());
    } catch {
      setRawQuery(fallbackQuery.trim());
    }
  };
}

const filterTabs =
  (query: string) =>
  (tabs: readonly BrowserExtension.TabCandidate[]): BrowserExtension.TabCandidate[] => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return [...tabs];
    return tabs.filter(
      (tab) => tab.title.toLowerCase().includes(needle) || tab.url.toLowerCase().includes(needle),
    );
  };
