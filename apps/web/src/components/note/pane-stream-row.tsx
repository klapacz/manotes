import { useAtomValue } from "@effect/atom-solid";
import { Option, Stream, Types } from "effect";
import { createEffect, createMemo, onCleanup } from "solid-js";
import {
  MatchAsyncResult,
  MatchTag,
  NoteCache,
  NoteSchema,
  bindRt,
  createAtomStore,
  createSyncedAtom,
} from "../../lib";
import { EditorPool } from "./editor-pool";
import { Focus } from "./focus";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "../../lib/note/pane.schema";
import { NoteStream } from "../../lib/note/stream";
import { DOMScroll } from "../../lib/dom-scroll";
import { NoteActions, NoteSeparator, NoteShell } from "./shared";

export function PaneStreamRow(props: { item: NoteStream.ListItem; sort: PaneSchema.StreamSort }) {
  return (
    <MatchTag
      when={props.item}
      cases={{
        note: (item) => <NoteRow row={item()} />,
        separator: (item) => <NoteSeparator dateString={item().groupKey} />,
      }}
    />
  );
}

function NoteRow(props: { row: Types.ExtractTag<NoteStream.ListItem, "note"> }) {
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

  let el: HTMLElement | undefined;
  const fid = Focus.useId();
  const fnode = Focus.createNode((ctx) => ({
    id: fid.note(props.row.note.id),
    focus: () => {
      // Keep horizontal pane scrolling owned by the pane focus node; native focus
      // scrolling can otherwise race it and leave the target pane off-center.
      el?.focus({ preventScroll: true });
      if (el) DOMScroll.scrollIntoNearestY(el);
    },
    onKeyDown: (event) => {
      if (event.key !== "Enter") return;
      ctx.focusNode(fid.editor(props.row.note.id));
      return true;
    },
  }));

  createEffect(() => {
    // Keep horizontal pane scrolling owned by the pane focus node; native focus
    // scrolling can otherwise race it and leave the target pane off-center.
    if (fnode.focused() && el && document.activeElement !== el) el.focus({ preventScroll: true });
  });

  return (
    <Focus.NodeProvider node={fnode}>
      <NoteShell
        ref={(ref) => (el = ref)}
        class="pb-6 space-y-2"
        classList={{ "border-t": !props.row.firstInGroup }}
        noteId={props.row.note.id}
      >
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
        <NoteActions
          note={meta()}
          groupKey={props.row.groupKey}
          dirty={props.row.dirty}
          sort={pane().sort}
        />
      </NoteShell>
    </Focus.NodeProvider>
  );
}
