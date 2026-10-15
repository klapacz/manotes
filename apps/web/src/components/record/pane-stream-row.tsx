import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/reactivity";
import { LiveDoc } from "../../lib/live-doc.service";
import { LiveDocAtom } from "../../lib/live-doc.atom";
import { Equal, Option, Stream } from "effect";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  MatchAsyncResult,
  MatchTag,
  RecordCache,
  RecordSchema,
  bindRt,
  createAtomStore,
  createSyncedAtom,
} from "../../lib";
import { AudioMemo } from "../audio-memo";
import { EditorPool } from "./editor-pool";
import { Focus } from "./focus";
import type { RecordStream } from "../../lib/record/stream";
import { PaneCtx } from "../../lib/record/pane.ctx";
import { RecordActions, RecordDivider, RecordShell } from "./shared";
import { VirtualList } from "../../lib/virtual-list";

export type Row = RecordStream.ListItem;

export function Root(props: { row: Row; onClearDraft: (id: RecordSchema.Id) => void }) {
  return (
    <MatchTag
      when={props.row}
      cases={{
        draft: (row) => {
          const id = row().draft.id;
          onCleanup(() => props.onClearDraft(id));

          return (
            <RecordingContent
              draft={row().draft}
              groupKey={row().groupKey}
              firstInGroup={row().firstInGroup}
              onCancel={() => props.onClearDraft(id)}
            />
          );
        },
        record: (row) => {
          const recordIdAtom = createSyncedAtom(() => row().record.id);

          const live = createAtomStore(
            bindRt((rt) => {
              return rt.atom((get) => {
                return RecordCache.Service.use((cache) => cache.changes(get(recordIdAtom))).pipe(
                  Stream.unwrap,
                  Stream.map(Option.getOrNull),
                );
              });
            }),
            null,
          );

          return (
            <RecordContent
              record={live.value ?? row().record}
              groupKey={row().groupKey}
              firstInGroup={row().firstInGroup}
            />
          );
        },
      }}
    />
  );
}

function RecordingContent(props: {
  draft: AudioMemo.Draft;
  groupKey: string;
  firstInGroup: boolean;
  onCancel: () => void;
}) {
  const listRow = VirtualList.useRow();
  const fid = Focus.useId();

  const node = Focus.createNode(() => ({
    id: fid.record(props.draft.id),
    enabled: listRow.ready(),
    focus: (element, options) => {
      Focus.focusBrowseTarget(element);

      if (options?.reveal === "always" || (options?.reveal === "if-hidden" && !listRow.visible())) {
        listRow.reveal();
      }
    },
  }));

  return (
    <Focus.NodeProvider node={node}>
      <Focus.Element class="outline-none group">
        <Show when={props.firstInGroup}>
          <RecordDivider date={props.groupKey} />
        </Show>
        <RecordShell>
          <AudioMemo.RecordingRow draft={props.draft} onCancel={props.onCancel} />
        </RecordShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function RecordContent(props: {
  record: RecordSchema.Meta;
  groupKey: string;
  firstInGroup: boolean;
}) {
  const recordIdAtom = createSyncedAtom(() => props.record.id);

  // Rows attach a pooled persistent editor instead of mounting their own;
  // scroll-back revisits reattach the same ProseMirror DOM instantly. The slot
  // is acquired through an atom so its scope holds the pool's RcMap reference —
  // unmount releases it, and the pool's idle TTL decides eviction.
  const pool = EditorPool.use();
  const slotAtom = bindRt((rt) => rt.atom((get) => pool.get(get(recordIdAtom))));
  const slotResult = useAtomValue(slotAtom);

  const listRow = VirtualList.useRow();

  const docState = LiveDocAtom.use({ recordId: () => props.record.id });

  const editorReady = () => {
    return AsyncResult.isSuccess(slotResult()) && LiveDoc.Doc.$is("Ready")(docState());
  };

  const fnode = Focus.createRecordNode(
    () => props.record.id,
    () => ({
      // Reveal only a booted row: its editor supplies Virtua with the real height.
      enabled: listRow.ready() && editorReady(),
      focus: (element, options) => {
        Focus.focusBrowseTarget(element);

        // Virtua owns vertical scrolling; the request decides whether to use it.
        if (
          options?.reveal === "always" ||
          (options?.reveal === "if-hidden" && !listRow.visible())
        ) {
          listRow.reveal();
        }
      },
    }),
  );

  const pane = PaneCtx.useStream();
  const focus = Focus.use();
  const fid = Focus.useId();

  // Snippets expand while editing: the (sticky) highlight sits on the editor
  // inside the record, or a request is about to enter it.
  const clamped = () => {
    return (
      pane().view === "snippets" &&
      !(fnode.highlightWithin() && !fnode.highlighted()) &&
      !Equal.equals(focus.pendingId(), fid.editor(props.record.id))
    );
  };

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="outline-none group">
        <Show when={props.firstInGroup}>
          <RecordDivider date={props.groupKey} />
        </Show>

        <RecordShell>
          <RecordActions record={props.record} />
          <MatchAsyncResult
            when={slotResult()}
            onSuccess={(slot) => {
              createEffect(() => {
                slot().setAttached(listRow.ready());
                onCleanup(() => slot().setAttached(false));
              });

              return <RecordClip clamped={clamped()} content={slot().container} />;
            }}
          />
        </RecordShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

// Clamps the record to its first lines, fading the cut only when content overflows.
function RecordClip(props: { clamped: boolean; content: HTMLElement }) {
  const [clip, setClip] = createSignal<HTMLDivElement>();
  const [overflowing, setOverflowing] = createSignal(false);

  createEffect(() => {
    const element = clip();

    if (!element) return;

    const observer = new ResizeObserver(() => {
      return setOverflowing(element.scrollHeight > element.clientHeight);
    });

    observer.observe(element);
    observer.observe(props.content);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={setClip}
      class="overflow-hidden"
      classList={{
        "max-h-32": props.clamped,
        "mask-b-from-40%": props.clamped && overflowing(),
      }}
    >
      {props.content}
    </div>
  );
}

export * as PaneStreamRow from "./pane-stream-row";
