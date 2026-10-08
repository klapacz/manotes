import { Link } from "@tanstack/solid-router";
import { Data, Option, Stream } from "effect";
import { defineSolidNodeView, type SolidNodeViewProps } from "prosekit/solid";
import { createMemo } from "solid-js";
import { bindRt, createAtomStore, createSyncedAtom } from "../..";
import * as NoteCache from "../../note-cache.service";
import { NoteFormat } from "../../note";
import { PaneCursor } from "../../note/pane.cursor";
import { PaneCtx } from "../../note/pane.ctx";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { PaneScroll } from "../../note/pane.scroll";
import {
  decodeStreamRefAttrs,
  streamRefLabel,
  type StreamRefAttrs,
} from "@manotes/shared/editor/stream-ref/spec";

const makePane = Data.taggedEnum<PaneSchema.PaneInput>();

export function defineStreamRefRuntime() {
  return defineSolidNodeView({ name: "streamRef", component: StreamRefView });
}

export function createStreamRefLabel(attrs: () => StreamRefAttrs) {
  const backlinksTo = createNoteLabel(() => attrs().filter.backlinksTo);
  const linksFrom = createNoteLabel(() => attrs().filter.linksFrom);

  return () =>
    streamRefLabel(
      attrs(),
      (id) => (id === attrs().filter.backlinksTo ? backlinksTo() : linksFrom()) ?? id,
    );
}

function StreamRefView(props: SolidNodeViewProps) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const attrs = createMemo(() => decodeStreamRefAttrs(props.node.attrs));
  const label = createStreamRefLabel(attrs);
  const input = () => makePane.stream(attrs());

  return (
    <Link
      {...PaneCtx.linkOptions(ctx, PaneCursor.openNext(input()))}
      data-stream-ref={JSON.stringify(attrs())}
      contentEditable={false}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;

        if (scroll.scrollToPane(input()).found) event.preventDefault();
      }}
    >
      {label()}
    </Link>
  );
}

export function createNoteLabel(id: () => string | undefined) {
  const idAtom = createSyncedAtom(id);

  const label = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const noteId = get(idAtom);

        if (!noteId) return Stream.succeed(undefined);

        return NoteCache.Service.use((cache) => cache.changes(noteId)).pipe(
          Stream.unwrap,
          Stream.map((note) => Option.getOrUndefined(Option.map(note, NoteFormat.label))),
        );
      }),
    ),
    undefined,
  );

  return () => label.value;
}
