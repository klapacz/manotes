import { useAtomValue } from "@effect/atom-solid";
import { Option, Stream, Types } from "effect";
import { createMemo } from "solid-js";
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
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "../../lib/note/pane.schema";
import { NoteStream } from "../../lib/note/stream";
import { NoteActions, NoteSeparator } from "./shared";

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

  return (
    <article
      id={`note-${props.row.note.id}`}
      class="pb-6 space-y-2"
      classList={{
        "border-t": !props.row.firstInGroup,
      }}
    >
      <MatchAsyncResult when={slotResult()} onSuccess={(slot) => slot().container} />
      <NoteActions
        note={meta()}
        groupKey={props.row.groupKey}
        dirty={props.row.dirty}
        sort={pane().sort}
      />
    </article>
  );
}
