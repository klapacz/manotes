import { useAtomValue } from "@effect/atom-solid";
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
import { DOMScroll } from "../../lib/dom-scroll";
import { NoteCreate } from "./note-create";
import { NoteActions, NoteDivider, NoteShell } from "./shared";

export function PaneStreamRow(props: { row: NoteStream.ListItem; onRefresh: () => void }) {
  const createNote = NoteCreate.useCreateNote();
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
    null as NoteCache.NotePreview | null,
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

  const fid = Focus.useId();
  const fnode = Focus.createNode(() => ({
    id: fid.note(props.row.note.id),
    syncFocus: (element) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          // Keep scrolling owned by the app focus/scroll code; native focus scrolling
          // can otherwise race horizontal pane centering and virtual-list autoscroll.
          element.focus({ preventScroll: true });
          // Keep horizontal pane scrolling owned by the pane focus node; native focus
          // scrolling can otherwise race it and leave the target pane off-center.
          // Scroll to the row wrapper, not the card: the wrapper includes the group
          // divider that sits in the gutter above the card, so autoscroll keeps it
          // visible instead of pinning the card top and clipping the label.
          DOMScroll.scrollIntoNearestY(element);
        }),
      );
    },
  }));

  fnode.registerShortcuts([
    {
      key: NoteCreate.shortcut,
      handler: () => {
        createNote(
          { date: props.row.note.date, pool, payload: NoteCreate.prefilledPayload(pane()) },
          (note) => {
            props.onRefresh();
            fnode.focusWhenAvailable(fid.editor(note.id));
          },
        );
        return true;
      },
    },
    {
      key: "Enter",
      handler: () => {
        fnode.focusNode(fid.editor(props.row.note.id));
        return true;
      },
    },
  ]);

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
                slot().setFocusParent(fnode);
                onCleanup(() => slot().setFocusParent(undefined));
              });
              return slot().container;
            }}
          />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
