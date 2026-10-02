import { BootState } from "../../editor";
import { Option, Stream } from "effect";
import { createEffect, createMemo, Show } from "solid-js";
import { NoteCache, NoteSchema } from "../../lib";
import { runScoped, runStream } from "../../lib/solid-effect";
import { EditorPool } from "./editor-pool";
import { Focus } from "./focus";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { NoteStream } from "../../lib/note/stream";
import { NoteActions, NoteDivider, NoteShell } from "./shared";
import { VirtualList } from "../../lib/virtual-list";

export function PaneStreamRow(props: { row: NoteStream.ListItem }) {
  // The stream stops refreshing a note once it leaves the query (it is only
  // retained); the shared per-note cache keeps its metadata live regardless.
  const live = createMemo(
    () =>
      runStream(
        NoteCache.Service.use((cache) => cache.changes(props.row.note.id)).pipe(
          Stream.unwrap,
          Stream.map(Option.getOrNull),
        ),
      ),
    { loadingValue: null },
  );

  const meta = createMemo((): NoteSchema.Meta => live() ?? props.row.note);
  const pane = PaneCtx.useStream();

  // Rows attach a pooled persistent editor instead of mounting their own;
  // scroll-back revisits reattach the same ProseMirror DOM instantly. The slot
  // is acquired in the memo's scope, which holds the pool's RcMap reference —
  // unmount releases it, and the pool's idle TTL decides eviction.
  const pool = EditorPool.use();
  const listRow = VirtualList.useRow();

  const slot = createMemo<EditorPool.Slot | undefined>(
    () => runScoped(pool.get(props.row.note.id)),
    { loadingValue: undefined },
  );

  createEffect(
    () => ({ slot: slot(), ready: listRow.ready() }),
    ({ slot, ready }) => {
      if (!slot) return;

      slot.setAttached(ready);

      return () => slot.setAttached(false);
    },
  );

  const editorReady = () => {
    const current = slot();

    return current !== undefined && BootState.$is("Ready")(current.bootState());
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
          <Show when={slot()}>{(slot) => slot().container}</Show>
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
