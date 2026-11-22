import type { ComponentProps } from "@solidjs/web";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Effect, Equal, Option, Stream } from "effect";
import {
  Loading,
  Show,
  createEffect,
  createMemo,
  createProjection,
  createSignal,
  getOwner,
  isPending,
} from "solid-js";
import { VirtualList } from "../../lib/virtual-list";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { RecordStreamCache, useGraphStream } from "../../lib";
import { PaneCtx } from "../../lib/record/pane.ctx";
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
  const query = createMemo(() => ({ filter: pane().filter, sort: pane().sort }), {
    equals: Equal.equals,
  });

  // Pooled editors persist across row unmounts and query transitions. The pool
  // is an Effect resource owned by its stream's scope, captured under the pane
  // owner so pooled editor roots inherit the pane's contexts.
  const owner = getOwner();

  const pool = useGraphStream(() => {
    return EditorPool.make(owner, () => pane().filter).pipe(
      Effect.map((pool) => Stream.concat(Stream.succeed(pool), Stream.never)),
      Stream.unwrap,
    );
  });

  const recording = PaneStreamRecording.use();

  // The DB query owns filtering and sorting; the stream only layers the
  // refresh-gated pinned snapshot on top of the matching rows. Each resolved
  // emission has already preloaded and booted the first editor slots.
  const stream = useGraphStream(
    () => {
      const currentQuery = query();
      refreshToken();
      const editors = pool();

      return Stream.unwrap(
        Effect.gen(function* () {
          const changes = yield* RecordStreamCache.Service.use((cache) => {
            return cache.changes(currentQuery);
          });

          return changes.pipe(
            Stream.scan(() => RecordStream.initialState, RecordStream.retain(currentQuery.sort)),
            // `scan` emits its initial accumulator before the first SQL result;
            // keep resolved state tied to real rows, after the first result is preloaded.
            Stream.drop(1),
            Stream.mapEffect((state) => {
              return Effect.scoped(editors.preload(preloadRecordIds(state.items))).pipe(
                Effect.as({ ...state, sort: currentQuery.sort }),
              );
            }),
          );
        }),
      );
    },
    { deferred: true },
  );

  // Draft changes rebuild the final list without restarting SQL or entering its
  // pinned snapshot. Reconciling by ListItem.id keeps row references stable
  // across emissions so virtua reuses mounted editors.
  const rows = createProjection<ReadonlyArray<RecordStream.ListItem>>(
    () => {
      const current = stream();

      return RecordStream.list({
        items: current.items,
        draft: recording.draft(),
        sort: current.sort,
      });
    },
    [],
    { key: "id" },
  );

  const refresh = () => setRefreshToken((token) => token + 1);

  const createRecord = RecordCreate.useCreateRecord();

  const createRecordOn = (date: string | undefined) => {
    createRecord({ date, pool: pool(), pane: pane() }, (record) => {
      refresh();
      focus.request(fid.editor(record.id), { reveal: "always" });
    });
  };

  const filteredDate = () => {
    return Option.getOrUndefined(StreamSettings.firstDate(pane().filter));
  };

  const hasSearch = () => {
    return StreamSettings.firstSearch(pane().filter).pipe(
      Option.exists((text) => text.trim().length > 0),
    );
  };

  const handleCreate = () => createRecordOn(filteredDate());

  // From a record, create beside it on its date; otherwise use the pane's date.
  const createNearFocus = () => {
    const recordId = Focus.recordIn(pane().paneId, focus.activeId());
    const row = rows.find((row) => RecordStream.recordId(row) === recordId);

    createRecordOn(row ? RecordStream.date(row) : filteredDate());
  };

  // Rendering, keyboard order and retention all derive from these same rows.
  const listOrder = createMemo(() => recordIdsFromRows(rows));

  const [lastFocused, setLastFocused] = createSignal<RecordSchema.Id>();

  const record = recording.createControls({
    // Recording is available everywhere for now.
    // TODO: Consider restricting it to streams filtered by `_tag = "note"`.
    enabled: () => true,
    getFocusedRow() {
      // The Record button may have taken focus from the originating record.
      const id = Focus.recordIn(pane().paneId, focus.activeId()) ?? lastFocused();

      return stream().items.find(({ record }) => record.id === id);
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
    enabled: Boolean(stream()),
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
      handler: () => {
        createNearFocus();

        return true;
      },
    },
  ]);

  createEffect(
    () => ({ id: focus.activeId(), paneId: pane().paneId }),
    ({ id, paneId }) => {
      const recordId = Focus.recordIn(paneId, id);

      if (recordId) setLastFocused(recordId);
    },
  );

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <Loading fallback={<PaneStreamFilter dirty={false} onRefresh={refresh} />}>
          <PaneStreamFilter
            onCreate={handleCreate}
            record={record()}
            dirty={stream().dirty}
            pending={isPending(() => stream())}
            onRefresh={refresh}
          />
          <EditorPool.Provider pool={pool()}>
            <Show
              when={rows.length > 0}
              fallback={
                <PaneEmptyState>
                  {hasSearch() ? "No records match your search." : "No records in this pane."}
                </PaneEmptyState>
              }
            >
              <div
                class={[
                  "min-h-0 flex-1 transition-opacity duration-150 ease-out starting:opacity-0",
                  { "opacity-60": isPending(() => stream()) },
                ]}
              >
                <VirtualList.Root data={rows} key={RecordStream.recordId} retained={retained()}>
                  {(item) => <PaneStreamRow.Root row={item} onClearDraft={recording.clearDraft} />}
                </VirtualList.Root>
              </div>
            </Show>
          </EditorPool.Provider>
        </Loading>
      </Focus.Element>
    </Focus.NodeProvider>
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
