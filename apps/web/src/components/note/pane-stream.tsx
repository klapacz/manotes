import { Effect, Stream } from "effect";
import { Show, createSignal, getOwner, onMount } from "solid-js";
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
import { PaneStreamRow } from "./pane-stream-row";
import { EditorPool } from "./editor-pool";
import { PaneActions, PaneEmptyState, PaneShell } from "./shared";

const PRELOAD_EDITOR_COUNT = 12;

export function PaneStream() {
  const pane = PaneCtx.useStream();
  const queryAtom = createSyncedAtom(() => PaneSchema.paneToQuery(pane()));

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

  return (
    <PaneShell>
      <div class="flex gap-3 justify-between">
        <PaneActions />
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
                      <VList data={state().value.rows} bufferSize={1200} style={{ height: "100%" }}>
                        {(item) => <PaneStreamRow item={item} sort={pane().sort} />}
                      </VList>
                    </div>
                  );
                }}
              </Show>
            </EditorPool.Provider>
          ),
        }}
      />
    </PaneShell>
  );
}

function preloadNoteIds(rows: ReadonlyArray<NoteStream.ListItem>): ReadonlyArray<string> {
  return rows
    .filter((row) => row._tag === "note")
    .slice(0, PRELOAD_EDITOR_COUNT)
    .map((row) => row.note.id);
}
