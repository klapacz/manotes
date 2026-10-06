import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { BootState } from "../../editor";
import { Equal, Option, Stream } from "effect";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  MatchAsyncResult,
  MatchTag,
  NoteCache,
  NoteSchema,
  bindRt,
  createAtomStore,
  createSyncedAtom,
} from "../../lib";
import { AudioMemo } from "../audio-memo";
import { EditorPool } from "./editor-pool";
import { Focus } from "./focus";
import type { NoteStream } from "../../lib/note/stream";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { NoteActions, NoteDivider, NoteShell } from "./shared";
import { VirtualList } from "../../lib/virtual-list";

export type Row = NoteStream.ListItem;

export function Root(props: { row: Row; onClearDraft: (id: NoteSchema.Id) => void }) {
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
        note: (row) => {
          const noteIdAtom = createSyncedAtom(() => row().note.id);

          const live = createAtomStore(
            bindRt((rt) =>
              rt.atom((get) =>
                NoteCache.Service.use((cache) => cache.changes(get(noteIdAtom))).pipe(
                  Stream.unwrap,
                  Stream.map(Option.getOrNull),
                ),
              ),
            ),
            null,
          );

          return (
            <NoteContent
              note={live.value ?? row().note}
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
    id: fid.note(props.draft.id),
    enabled: listRow.ready(),
    focus: (element, options) => {
      Focus.focusBrowseTarget(element);

      if (options?.reveal === "always" || (options?.reveal === "if-hidden" && !listRow.visible()))
        listRow.reveal();
    },
  }));

  return (
    <Focus.NodeProvider node={node}>
      <Focus.Element class="outline-none group">
        <Show when={props.firstInGroup}>
          <NoteDivider date={props.groupKey} />
        </Show>
        <NoteShell>
          <AudioMemo.RecordingRow draft={props.draft} onCancel={props.onCancel} />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function NoteContent(props: { note: NoteSchema.Meta; groupKey: string; firstInGroup: boolean }) {
  const noteIdAtom = createSyncedAtom(() => props.note.id);

  // Rows attach a pooled persistent editor instead of mounting their own;
  // scroll-back revisits reattach the same ProseMirror DOM instantly. The slot
  // is acquired through an atom so its scope holds the pool's RcMap reference —
  // unmount releases it, and the pool's idle TTL decides eviction.
  const pool = EditorPool.use();
  const slotAtom = bindRt((rt) => rt.atom((get) => pool.get(get(noteIdAtom))));
  const slotResult = useAtomValue(slotAtom);

  const listRow = VirtualList.useRow();

  const editorReady = () => {
    const slot = slotResult();

    return AsyncResult.isSuccess(slot) && BootState.$is("Ready")(slot.value.bootState());
  };

  const fnode = Focus.createNoteNode(
    () => props.note.id,
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
  // inside the note, or a request is about to enter it.
  const clamped = () =>
    pane().view === "snippets" &&
    !(fnode.highlightWithin() && !fnode.highlighted()) &&
    !Equal.equals(focus.pendingId(), fid.editor(props.note.id));

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="outline-none group">
        <Show when={props.firstInGroup}>
          <NoteDivider date={props.groupKey} />
        </Show>

        <NoteShell>
          <NoteActions note={props.note} />
          <MatchAsyncResult
            when={slotResult()}
            onSuccess={(slot) => {
              createEffect(() => {
                slot().setAttached(listRow.ready());
                onCleanup(() => slot().setAttached(false));
              });

              return <NoteClip clamped={clamped()} content={slot().container} />;
            }}
          />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

// Clamps the note to its first lines, fading the cut only when content overflows.
function NoteClip(props: { clamped: boolean; content: HTMLElement }) {
  const [clip, setClip] = createSignal<HTMLDivElement>();
  const [overflowing, setOverflowing] = createSignal(false);

  createEffect(() => {
    const element = clip();

    if (!element) return;

    const observer = new ResizeObserver(() =>
      setOverflowing(element.scrollHeight > element.clientHeight),
    );

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
