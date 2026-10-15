import { Effect, Equal, Stream, Predicate } from "effect";
import { Atom } from "effect/reactivity";
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
import type { RecordSchema } from "@manotes/shared/record.schema";
import {
  MatchTag,
  RecordStreamCache,
  bindRt,
  createAtomResultStore,
  createSyncedAtom,
} from "../../lib";
import { PaneCtx } from "../../lib/record/pane.ctx";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordStream } from "../../lib/record/stream";
import { EditorPool } from "./editor-pool";
import { RecordCreate } from "./record-create";
import { PaneStreamFilter } from "./pane-stream-filter";
import { Focus } from "./focus";
import { PaneStreamRow } from "./pane-stream-row";
import { PaneStreamRecording } from "./pane-stream-recording";
import { PaneEmptyState, PaneShell } from "./shared";

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
  const stateAtom = bindRt((rt) => {
    return rt.atom((get) => {
      const query = get(queryAtom);
      get(refreshTokenAtom);

      return Stream.unwrap(
        Effect.gen(function* () {
          const pool = yield* get.result(poolAtom(), { suspendOnWaiting: true });
          const changes = yield* RecordStreamCache.Service.use((cache) => cache.changes(query));

          return changes.pipe(
            Stream.scan(() => RecordStream.initialState, RecordStream.retain(query.sort)),
            // `scan` emits its initial accumulator before the first SQL result;
            // keep Success tied to real rows, after the first result is preloaded.
            Stream.drop(1),
            Stream.map((snapshot) => ({ ...snapshot, pool })),
            Stream.mapEffect((state) => {
              return Effect.scoped(pool.preload(preloadRecordIds(state.items))).pipe(
                Effect.as(state),
              );
            }),
            // Draft changes rebuild the final list, without restarting SQL or
            // entering its pinned snapshot. Grouping runs once, after insertion.
            Stream.zipLatestWith(Atom.toStream(recording.draftAtom), (snapshot, draft) => ({
              ...snapshot,
              rows: RecordStream.list({ items: snapshot.items, draft, sort: query.sort }),
            })),
          );
        }),
      );
    });
  });

  // Reconciliation keys row nodes by ListItem.id, keeping row references
  // stable across emissions — virtua reuses rows by identity, so mounted
  // editors survive while their content stays reactive.
  const state = createAtomResultStore(stateAtom);

  const refresh = () => setRefreshToken((token) => token + 1);

  const createRecord = RecordCreate.useCreateRecord();

  const createRecordOn = (date: string | undefined) => {
    if (!Predicate.isTagged(state, "Success")) return;
    createRecord({ date, pool: state.value.pool, pane: pane() }, (record) => {
      refresh();
      focus.request(fid.editor(record.id), { reveal: "always" });
    });
  };

  const handleCreate = () => createRecordOn(pane().filter.date);

  // From a record, create beside it on its date; otherwise use the pane's date.
  const createNearFocus = () => {
    const recordId = Focus.recordIn(pane().paneId, focus.activeId());
    const rows = Predicate.isTagged(state, "Success") ? state.value.rows : [];
    const row = rows.find((row) => RecordStream.recordId(row) === recordId);

    createRecordOn(row ? RecordStream.date(row) : pane().filter.date);
  };

  // Rendering, keyboard order and retention all derive from these same rows.
  const listOrder = createMemo(() => {
    return Predicate.isTagged(state, "Success") ? recordIdsFromRows(state.value.rows) : [];
  });

  const [lastFocused, setLastFocused] = createSignal<RecordSchema.Id>();

  const record = recording.createControls({
    enabled: () => {
      return (
        Predicate.isTagged(state, "Success") &&
        (Predicate.isTagged(pane().filter.type, "notes") ||
          Predicate.isTagged(pane().filter.type, "pages"))
      );
    },
    getFocusedRow() {
      if (!Predicate.isTagged(state, "Success")) return;

      // The Record button may have taken focus from the originating record.
      const id = Focus.recordIn(pane().paneId, focus.activeId()) ?? lastFocused();

      return state.value.items.find(({ record }) => record.id === id);
    },
  });

  const pendingRecord = () => Focus.recordIn(pane().paneId, focus.pendingId());

  const retained = () => {
    return [lastFocused(), pendingRecord(), recording.draftId()].filter((id) => id !== undefined);
  };

  const jump = (index: number) => {
    const recordId = listOrder().at(index);

    if (!recordId) return false;

    focus.request(fid.record(recordId), { reveal: "if-hidden" });

    return true;
  };

  const move = (delta: number) => {
    const ids = listOrder();

    if (ids.length === 0) return false;

    const recordId = Focus.recordIn(pane().paneId, focus.targetId());
    const at = recordId ? ids.indexOf(recordId) : -1;

    const nextIndex = Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + delta));

    focus.request(fid.record(ids[nextIndex]!), { reveal: "always" });

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

      // A remembered record still in view keeps its reading position.
      if (target) focus.request(fid.record(target), { reveal: "if-hidden" });
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
      key: RecordCreate.shortcut,
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
        const recordId = Focus.recordIn(pane().paneId, id);

        if (recordId) setLastFocused(recordId);
      },
    ),
  );

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <PaneStreamFilter
          onCreate={Predicate.isTagged(state, "Success") ? handleCreate : undefined}
          record={record()}
          dirty={Predicate.isTagged(state, "Success") ? state.value.dirty : false}
          onRefresh={refresh}
        />
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
                        ? "No records match your search."
                        : "No records in this pane."}
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
  rows: ReadonlyArray<RecordStream.ListItem>;
  retained: ReadonlyArray<RecordSchema.Id>;
  onClearDraft: (id: RecordSchema.Id) => void;
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
      <VirtualList.Root data={props.rows} key={RecordStream.recordId} retained={props.retained}>
        {(item) => <PaneStreamRow.Root row={item} onClearDraft={props.onClearDraft} />}
      </VirtualList.Root>
    </div>
  );
}

function preloadRecordIds(items: RecordStream.InnerItems): ReadonlyArray<RecordSchema.Id> {
  return items.slice(0, PRELOAD_EDITOR_COUNT).map(({ record }) => record.id);
}

function recordIdsFromRows(
  rows: ReadonlyArray<RecordStream.ListItem>,
): ReadonlyArray<RecordSchema.Id> {
  return rows.map(RecordStream.recordId);
}
