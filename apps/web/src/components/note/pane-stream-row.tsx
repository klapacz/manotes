import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { BootState } from "../../editor";
import { Equal, Option, Stream } from "effect";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import {
  MatchAsyncResult,
  NoteCache,
  NoteSchema,
  bindRt,
  createAtomStore,
  createSyncedAtom,
} from "../../lib";
import { EditorPool } from "./editor-pool";
import { Focus } from "./focus";
import { NoteStream } from "../../lib/note/stream";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { NoteActions, NoteDivider, NoteShell } from "./shared";
import { VirtualList } from "../../lib/virtual-list";

export function PaneStreamRow(props: { row: NoteStream.ListItem }) {
  // The stream stops refreshing a note once it leaves the query (it is only
  // retained); the shared per-note cache keeps its metadata live regardless.
  const noteIdAtom = createSyncedAtom(() => props.row.note.id);

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

  const meta = createMemo((): NoteSchema.Meta => live.value ?? props.row.note);

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
    () => props.row.note.id,
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
    !Equal.equals(focus.pendingId(), fid.editor(props.row.note.id));

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="outline-none group">
        <Show when={props.row.firstInGroup}>
          <NoteDivider date={props.row.groupKey} />
        </Show>

        <NoteShell>
          <NoteActions note={meta()} />
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
