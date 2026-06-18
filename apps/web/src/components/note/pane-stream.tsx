import { Option, Effect, Stream, Array as Arr, Equal, Number } from "effect";
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onMount,
  type ComponentProps,
} from "solid-js";
import { VList } from "virtua/solid";
import {
  MatchTag,
  NoteStreamCache,
  bindRt,
  createAtomResultStore,
  createSyncedAtom,
} from "../../lib";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "../../lib/note/pane.schema";
import { NoteStream } from "../../lib/note/stream";
import { EditorPool } from "./editor-pool";
import { NoteCreate } from "./note-create";
import { PaneStreamFilter } from "./pane-stream-filter";
import { Focus } from "./focus";
import { PaneStreamRow } from "./pane-stream-row";
import { PaneActions, PaneEmptyState, PaneShell } from "./shared";
import { DOMScroll } from "../../lib/dom-scroll";

const PRELOAD_EDITOR_COUNT = 12;

export function PaneStream(props: ComponentProps<"section">) {
  const pane = PaneCtx.useStream();
  const [refreshToken, setRefreshToken] = createSignal(0);
  const queryAtom = createSyncedAtom(() => PaneSchema.paneToQuery(pane()));
  const refreshTokenAtom = createSyncedAtom(refreshToken);

  // Pooled editors persist across row unmounts. The pool is an Effect resource
  // owned by its atom's scope, captured under the pane owner so pooled editor
  // roots inherit the pane's contexts.
  const owner = getOwner();
  const poolAtom = bindRt((rt) => rt.atom(EditorPool.make(owner)));

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
            Stream.map(({ dirty, items }) => ({ dirty, rows: NoteStream.list(items), pool })),
            Stream.mapEffect((state) =>
              Effect.scoped(pool.preload(preloadNoteIds(state.rows))).pipe(Effect.as(state)),
            ),
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
  const handleCreate = () => {
    if (state._tag !== "Success") return;
    createNote(
      {
        date: pane().filter.date,
        pool: state.value.pool,
        payload: NoteCreate.prefilledPayload(pane()),
      },
      (note) => {
        refresh();
        fnode.focusWhenAvailable(fid.editor(note.id));
      },
    );
  };

  const fid = Focus.useId();
  const listOrder = createMemo(() => {
    if (state._tag !== "Success") return [];
    return noteIdsFromRows(state.value.rows).map(fid.note);
  });

  const [lastFocused, setLastFocused] = createSignal<Focus.FocusId>();
  createEffect(() => {
    const ids = listOrder();
    if (fnode.focused() && Arr.isArrayNonEmpty(ids)) {
      const last = lastFocused();
      if (last && Arr.contains(ids, last)) {
        return fnode.focusWhenAvailable(last);
      }

      fnode.focusWhenAvailable(Arr.headNonEmpty(ids));
    }
  });

  const move = (delta: number) => {
    const ids = listOrder();
    if (!Arr.isArrayNonEmpty(ids)) return false;

    const at = Arr.findFirstIndex(ids, (id) => {
      const focusedId = fnode.focusedId();
      return focusedId !== null && Equal.equals(id, focusedId);
    });
    const nextIndex = at.pipe(
      Option.map((idx) => idx + delta),
      Option.map(Number.clamp({ minimum: 0, maximum: ids.length - 1 })),
      Option.getOrElse(() => 0),
    );
    fnode.focusNode(ids[nextIndex]!);
    return true;
  };

  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    syncFocusWithin: (element) => {
      if (DOMScroll.isCenteredInScrollParent(element)) return;

      element.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    },
  }));

  fnode.registerShortcuts([
    {
      key: ["J", "ArrowDown"],
      allowRepeat: true,
      handler: () => move(1),
    },
    {
      key: ["K", "ArrowUp"],
      allowRepeat: true,
      handler: () => move(-1),
    },
    {
      key: NoteCreate.shortcut,
      enabled: () => state._tag === "Success",
      handler: () => {
        handleCreate();
        return true;
      },
    },
  ]);

  // TODO: get from stack not single id
  fnode.createChangeListener((id) => {
    if (id._tag === "NoteFocusId" && id.paneId === pane().paneId) {
      setLastFocused(id);
    }
  });

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <div class="flex gap-3 justify-between">
          <PaneStreamFilter
            dirty={state._tag === "Success" ? state.value.dirty : false}
            onRefresh={refresh}
          />
          <PaneActions onCreate={state._tag === "Success" ? handleCreate : undefined} />
        </div>
        <MatchTag
          when={state}
          cases={{
            Loading: () => null,
            Success: (state) => (
              <EditorPool.Provider pool={state().value.pool}>
                <Show
                  when={state().value.rows.length > 0}
                  fallback={<PaneEmptyState>No notes in this pane.</PaneEmptyState>}
                >
                  {(_) => {
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
                        <VList
                          data={state().value.rows}
                          bufferSize={1200}
                          style={{ height: "100%" }}
                        >
                          {(item) => <PaneStreamRow row={item} onRefresh={refresh} />}
                        </VList>
                      </div>
                    );
                  }}
                </Show>
              </EditorPool.Provider>
            ),
          }}
        />
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function preloadNoteIds(rows: ReadonlyArray<NoteStream.ListItem>): ReadonlyArray<string> {
  return noteIdsFromRows(rows).slice(0, PRELOAD_EDITOR_COUNT);
}

function noteIdsFromRows(rows: ReadonlyArray<NoteStream.ListItem>): ReadonlyArray<string> {
  return rows.map((row) => row.note.id);
}
