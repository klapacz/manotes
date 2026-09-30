import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { BootState } from "../../editor";
import { Option, Stream } from "effect";
import { createEffect, createMemo, onCleanup, Show } from "solid-js";
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
import { PaneCtx } from "../../lib/note/pane.ctx";
import { NoteStream } from "../../lib/note/stream";
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
  const pane = PaneCtx.useStream();

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
        element.focus({ preventScroll: true });

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

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="outline-none group">
        <Show when={props.row.firstInGroup}>
          <NoteDivider date={props.row.groupKey} />
        </Show>

        <NoteShell>
          <NoteActions
            note={meta()}
            groupKey={props.row.groupKey}
            dirty={props.row.dirty}
            sort={pane().sort}
          />
          <MatchAsyncResult
            when={slotResult()}
            onSuccess={(slot) => {
              createEffect(() => {
                slot().setAttached(listRow.ready());
                onCleanup(() => slot().setAttached(false));
              });

              return slot().container;
            }}
          />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
