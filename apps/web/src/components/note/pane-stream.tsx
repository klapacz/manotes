import { Effect, Equal, Stream, Predicate } from "effect";
import { Atom } from "effect/unstable/reactivity";
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onMount,
  on,
  type ComponentProps,
} from "solid-js";
import { VirtualList } from "../../lib/virtual-list";
import type { NoteSchema } from "@manotes/shared/note.schema";
import {
  MatchTag,
  NoteStreamCache,
  bindRt,
  createAtomResultStore,
  createSyncedAtom,
} from "../../lib";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { NoteStream } from "../../lib/note/stream";
import { EditorPool } from "./editor-pool";
import { NoteCreate } from "./note-create";
import { PaneStreamFilter } from "./pane-stream-filter";
import { Focus } from "./focus";
import { PaneStreamRow } from "./pane-stream-row";
import { PaneStreamRecording } from "./pane-stream-recording";
import { PaneEmptyState, PaneHeader, PaneShell } from "./shared";

const PRELOAD_EDITOR_COUNT = 12;

export function PaneStream(props: ComponentProps<"section">) {
  const pane = PaneCtx.useStream();
  const focus = Focus.use();
  const fid = Focus.useId();
  const [refreshToken, setRefreshToken] = createSignal(0);

  // Display-only pane changes (the snippet view) must not restart the query.
  const query = createMemo(() => PaneSchema.paneToQuery(pane()), undefined, {
    equals: Equal.equals,
  });

  const queryAtom = createSyncedAtom(query);
  const refreshTokenAtom = createSyncedAtom(refreshToken);

  // Pooled editors persist across row unmounts. The pool is an Effect resource
  // owned by its atom's scope, captured under the pane owner so pooled editor
  // roots inherit the pane's contexts.
  const owner = getOwner();

  const poolAtom = bindRt((rt) => rt.atom(EditorPool.make(owner, () => pane().filter)));

  const recording = PaneStreamRecording.use();

  // The DB query owns filtering and sorting; the stream only layers the
  // refresh-gated pinned snapshot on top of the matching rows. Each successful
  // emission has already preloaded and booted the first editor slots.
  const stateAtom = bindRt((rt) =>
    rt.atom((get) => {
      const query = get(queryAtom);
      get(refreshTokenAtom);

      return Stream.unwrap(
        Effect.gen(function* () {
          const pool = yield* get.result(poolAtom(), { suspendOnWaiting: true });
          const changes = yield* NoteStreamCache.Service.use((cache) => cache.changes(query));

          return changes.pipe(
            Stream.scan(NoteStream.initialState, NoteStream.retain(query.sort)),
            // `scan` emits its initial accumulator before the first SQL result;
            // keep Success tied to real rows, after the first result is preloaded.
            Stream.drop(1),
            Stream.map((snapshot) => ({ ...snapshot, pool })),
            Stream.mapEffect((state) =>
              Effect.scoped(pool.preload(preloadNoteIds(state.items))).pipe(Effect.as(state)),
            ),
            // Draft changes rebuild the final list, without restarting SQL or
            // entering its pinned snapshot. Grouping runs once, after insertion.
            Stream.zipLatestWith(Atom.toStream(recording.draftAtom), (snapshot, draft) => ({
              ...snapshot,
              rows: NoteStream.list({ items: snapshot.items, draft, sort: query.sort }),
            })),
          );
        }),
      );
    }),
  );

  // Reconciliation keys row nodes by ListItem.id, keeping row references
  // stable across emissions — virtua reuses rows by identity, so mounted
  // editors survive while their content stays reactive.
  const state = createAtomResultStore(stateAtom);

  const refresh = () => setRefreshToken((token) => token + 1);

  const createNote = NoteCreate.useCreateNote();

  const createNoteOn = (date: string | undefined) => {
    if (!Predicate.isTagged(state, "Success")) return;
    createNote(
      { date, pool: state.value.pool, payload: NoteCreate.prefilledPayload(pane()) },
      (note) => {
        refresh();
        focus.request(fid.editor(note.id), { reveal: "always" });
      },
    );
  };

  const handleCreate = () => createNoteOn(pane().filter.date);

  // From a note, create beside it on its date; otherwise use the pane's date.
  const createNearFocus = () => {
    const noteId = Focus.noteIn(pane().paneId, focus.activeId());
    const rows = Predicate.isTagged(state, "Success") ? state.value.rows : [];
    const row = rows.find((row) => NoteStream.noteId(row) === noteId);

    createNoteOn(row ? NoteStream.date(row) : pane().filter.date);
  };

  // Rendering, keyboard order and retention all derive from these same rows.
  const listOrder = createMemo(() =>
    Predicate.isTagged(state, "Success") ? noteIdsFromRows(state.value.rows) : [],
  );

  const [lastFocused, setLastFocused] = createSignal<NoteSchema.Id>();

  const record = recording.createControls({
    enabled: () => Predicate.isTagged(state, "Success"),
    getFocusedRow() {
      if (!Predicate.isTagged(state, "Success")) return;

      // The Record button may have taken focus from the originating note.
      const id = Focus.noteIn(pane().paneId, focus.activeId()) ?? lastFocused();

      return state.value.items.find(({ note }) => note.id === id);
    },
  });

  const pendingNote = () => Focus.noteIn(pane().paneId, focus.pendingId());

  const retained = () =>
    [lastFocused(), pendingNote(), recording.draftId()].filter((id) => id !== undefined);

  const jump = (index: number) => {
    const noteId = listOrder().at(index);

    if (!noteId) return false;

    focus.request(fid.note(noteId), { reveal: "if-hidden" });

    return true;
  };

  const move = (delta: number) => {
    const ids = listOrder();

    if (ids.length === 0) return false;

    const noteId = Focus.noteIn(pane().paneId, focus.targetId());
    const at = noteId ? ids.indexOf(noteId) : -1;

    const nextIndex = Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + delta));

    focus.request(fid.note(ids[nextIndex]!), { reveal: "always" });

    return true;
  };

  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    enabled: !Predicate.isTagged(state, "Loading"),
    focus: (element) => {
      Focus.focusBrowseTarget(element);
      const ids = listOrder();
      const previous = lastFocused();
      const target = previous && ids.includes(previous) ? previous : ids[0];

      // A remembered note still in view keeps its reading position.
      if (target) focus.request(fid.note(target), { reveal: "if-hidden" });
    },
  }));

  fnode.registerShortcuts([
    {
      key: [["G"]],
      handler: () => jump(0),
    },
    {
      key: [["Shift+G"]],
      handler: () => jump(-1),
    },
    {
      key: [["J"], ["ArrowDown"]],
      allowRepeat: true,
      handler: () => move(1),
    },
    {
      key: [["K"], ["ArrowUp"]],
      allowRepeat: true,
      handler: () => move(-1),
    },
    {
      key: NoteCreate.shortcut,
      enabled: () => Predicate.isTagged(state, "Success"),
      handler: () => {
        createNearFocus();

        return true;
      },
    },
  ]);

  createEffect(
    on(
      () => focus.activeId(),
      (id) => {
        const noteId = Focus.noteIn(pane().paneId, id);

        if (noteId) setLastFocused(noteId);
      },
    ),
  );

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <PaneHeader
          onCreate={Predicate.isTagged(state, "Success") ? handleCreate : undefined}
          record={record()}
        >
          <PaneStreamFilter
            dirty={Predicate.isTagged(state, "Success") ? state.value.dirty : false}
            onRefresh={refresh}
          />
        </PaneHeader>
        <MatchTag
          when={state}
          cases={{
            Loading: () => null,
            Success: (state) => (
              <EditorPool.Provider pool={state().value.pool}>
                <Show
                  when={state().value.rows.length > 0}
                  fallback={
                    <PaneEmptyState>
                      {pane().filter.search?.trim()
                        ? "No notes match your search."
                        : "No notes in this pane."}
                    </PaneEmptyState>
                  }
                >
                  <RevealedRows
                    rows={state().value.rows}
                    retained={retained()}
                    onClearDraft={recording.clearDraft}
                  />
                </Show>
              </EditorPool.Provider>
            ),
          }}
        />
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function RevealedRows(props: {
  rows: ReadonlyArray<NoteStream.ListItem>;
  retained: ReadonlyArray<NoteSchema.Id>;
  onClearDraft: (id: NoteSchema.Id) => void;
}) {
  const [revealed, setRevealed] = createSignal(false);

  onMount(() => {
    // Double rAF: the first frame commits opacity:0 (and the booted editors'
    // layout) to pixels, the second flips to opacity:1 so the CSS fade-in
    // actually animates.
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
  });

  return (
    <div
      class="min-h-0 flex-1 transition-opacity duration-150 ease-out"
      classList={{
        "opacity-0": !revealed(),
      }}
    >
      <VirtualList.Root data={props.rows} key={NoteStream.noteId} retained={props.retained}>
        {(item) => <PaneStreamRow.Root row={item} onClearDraft={props.onClearDraft} />}
      </VirtualList.Root>
    </div>
  );
}

function preloadNoteIds(items: NoteStream.InnerItems): ReadonlyArray<NoteSchema.Id> {
  return items.slice(0, PRELOAD_EDITOR_COUNT).map(({ note }) => note.id);
}

function noteIdsFromRows(rows: ReadonlyArray<NoteStream.ListItem>): ReadonlyArray<NoteSchema.Id> {
  return rows.map(NoteStream.noteId);
}
