import { Effect, flow, Stream, Array, Struct } from "effect";
import { useEditor } from "prosekit/solid";
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from "prosekit/solid/autocomplete";
import { For, Show, createMemo, createSignal } from "solid-js";
import {
  commandEmptyClass,
  commandItemBaseClass,
  commandListClass,
  commandSurfaceClass,
} from "../../../components/ui/command";
import { NoteCreate } from "../../../components/note/note-create";
import { NoteRepo, bindRt, createAtomState, createAtomStore, createSyncedAtom } from "../..";
import { cx } from "../../cva";
import { useArrowKeyAliases } from "../autocomplete";
import { NoteFormat } from "../../note";
import type { AppExtension } from "../../../editor.extension";
import * as BrowserExtensionClient from "../../browser-extension/client";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";
import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { useAtom } from "@effect/atom-solid";
import { PaneCtx } from "../../note/pane.ctx";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { createNoteLabel, createStreamRefLabel } from "../stream-ref/extension";
import { decodeStreamRefAttrs } from "@manotes/shared/editor/stream-ref/spec";

const BACKLINK_REGEX = /\[\[([^\]\n]*)$/u;

const TAB_REGEX = /\[@([^\]\n]*)$/u;

const STREAM_REF_REGEX = /\[!([^\]\n]*)$/u;

type BacklinkNote = {
  id: string;
  title: string;
};

const EMPTY_BACKLINK_NOTES: BacklinkNote[] = [];

const EMPTY_TAB_CANDIDATES: BrowserExtension.TabCandidate[] = [];

const popupClass = cx(commandSurfaceClass, commandListClass, "block w-56 border p-1 shadow-md");

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
    createNote({ payload: NoteCreate.pagePayload(title) }, (note) => onSelect(note.id));

  const notes = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const query = get(rawQueryAtom);
        const currentNoteId = get(currentNoteIdAtom);

        if (!get(openAtom)) return Stream.succeed(EMPTY_BACKLINK_NOTES);

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
    EMPTY_BACKLINK_NOTES,
  );

  return (
    <AutocompleteRoot
      regex={BACKLINK_REGEX}
      filter={() => true}
      queryBuilder={rawQuery}
      onOpenChange={(event) => setOpen(event.detail)}
      onQueryChange={(event) => setRawQuery(event.detail)}
    >
      <AutocompletePositioner class="z-50 block">
        <AutocompletePopup class={popupClass}>
          <AutocompleteEmpty class={commandEmptyClass}>No matching notes</AutocompleteEmpty>

          <For each={notes.value}>
            {(note) => (
              <AutocompleteItem
                class={cx(
                  commandItemBaseClass,
                  "data-highlighted:bg-control-hover data-highlighted:text-fg",
                )}
                onSelect={() => onSelect(note.id)}
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
                class={cx(
                  commandItemBaseClass,
                  "data-highlighted:bg-control-hover data-highlighted:text-fg",
                )}
                onSelect={() => onCreatePage(title)}
                value={`create:${title}`}
              >
                Create page “{title}”
              </AutocompleteItem>
            )}
          </Show>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
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

        if (!get(openAtom)) return Stream.succeed(EMPTY_TAB_CANDIDATES);

        return BrowserExtensionClient.watchTabs.pipe(Stream.map(filterTabs(query)));
      }),
    ),
    EMPTY_TAB_CANDIDATES,
  );

  const [, createTabNote] = useAtom(CreateTabNote, { mode: "promise" });

  const onTabSelect = async (tab: BrowserExtension.TabCandidate) => {
    try {
      const note = await createTabNote(tab);
      onSelect(note.id);
    } catch {}
  };

  return (
    <AutocompleteRoot
      regex={TAB_REGEX}
      filter={() => true}
      queryBuilder={rawQuery}
      onOpenChange={(event) => setOpen(event.detail)}
      onQueryChange={(event) => setRawQuery(event.detail)}
    >
      <AutocompletePositioner class="z-50 block">
        <AutocompletePopup class={popupClass}>
          <AutocompleteEmpty class={commandEmptyClass}>No matching tabs</AutocompleteEmpty>

          <For each={tabs.value}>
            {(tab) => (
              <AutocompleteItem
                class={cx(
                  commandItemBaseClass,
                  "data-highlighted:bg-control-hover data-highlighted:text-fg",
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
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  );
}

export function StreamRefMenu() {
  const editor = useEditor<AppExtension>();
  const insertBacklink = createBacklinkInsertion(editor);
  const ctx = PaneCtx.use();
  const [query, setQuery] = createSignal("");
  const [isOpen, setOpen] = createSignal(false);
  useArrowKeyAliases(editor, isOpen);

  const panes = createMemo(() =>
    isOpen() ? ctx.stack().filter((pane) => !PaneSchema.Pane.guards.recordings(pane)) : [],
  );

  const onSelect = (pane: PaneSchema.PaneNote | PaneSchema.PaneStream) => {
    if (PaneSchema.Pane.guards.note(pane)) {
      insertBacklink(pane.id);

      return;
    }

    // Capture the settings now; later edits to the source pane do not change the ref.
    const attrs = decodeStreamRefAttrs(pane);

    queueMicrotask(() => {
      editor().view.focus();
      editor().commands.insertStreamRef(attrs);
      editor().commands.insertText({ text: " " });
    });
  };

  return (
    <AutocompleteRoot
      regex={STREAM_REF_REGEX}
      filter={() => true}
      queryBuilder={rawQuery}
      onOpenChange={(event) => setOpen(event.detail)}
      onQueryChange={(event) => setQuery(event.detail)}
    >
      <AutocompletePositioner class="z-50 block">
        <AutocompletePopup class={cx(popupClass, "w-80")}>
          <AutocompleteEmpty class={commandEmptyClass}>No matching open panes</AutocompleteEmpty>
          <For each={panes()}>
            {(pane) => (
              <StreamRefMenuItem pane={pane} query={query()} onSelect={() => onSelect(pane)} />
            )}
          </For>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  );
}

function StreamRefMenuItem(props: {
  pane: PaneSchema.PaneNote | PaneSchema.PaneStream;
  query: string;
  onSelect: () => void;
}) {
  const pane = props.pane;

  const resolveLabel = PaneSchema.Pane.guards.note(pane)
    ? createNoteLabel(() => pane.id)
    : createStreamRefLabel(() => pane);

  const label = () => resolveLabel() ?? "[unavailable note]";

  return (
    <Show when={label().toLowerCase().includes(props.query.toLowerCase()) && label()} keyed>
      {(title) => (
        <AutocompleteItem
          class={cx(
            commandItemBaseClass,
            "data-highlighted:bg-control-hover data-highlighted:text-fg",
          )}
          onSelect={props.onSelect}
          value={props.pane.paneId}
        >
          {title}
        </AutocompleteItem>
      )}
    </Show>
  );
}

type AppEditor = ReturnType<typeof useEditor<AppExtension>>;

function createBacklinkInsertion(editor: AppEditor) {
  const insertBacklink = (id: string) => {
    editor().view.focus();

    const inserted = editor().commands.insertBacklink({ id });

    if (!inserted) {
      editor().commands.insertText({ text: `[[${id}]] ` });

      return;
    }

    editor().commands.insertText({ text: " " });
  };

  // Autocomplete emits valueChange and also runs its internal submit handler.
  // Deferring insertion avoids the submit deletion step removing the node.
  return (id: string) => queueMicrotask(() => insertBacklink(id));
}

// The default builder lowercases and strips punctuation; keep what was typed.
function rawQuery(match: RegExpExecArray) {
  return (match[1] ?? "").trim();
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
