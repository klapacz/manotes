import { RecordSchema } from "@manotes/shared/record.schema";
import { Link } from "@tanstack/solid-router";
import { Data, Option, Stream } from "effect";
import { defineSolidNodeView, type SolidNodeViewProps } from "prosekit/solid";
import { createMemo } from "solid-js";
import { bindRt, createAtomStore, createSyncedAtom } from "../..";
import { RecordCache } from "../../record-cache.service";
import { RecordFormat } from "../../record";
import { PaneCursor } from "../../record/pane.cursor";
import { PaneCtx } from "../../record/pane.ctx";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { PaneScroll } from "../../record/pane.scroll";
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
  const backlinksTo = createRecordLabel(() => attrs().filter.backlinksTo);
  const linksFrom = createRecordLabel(() => attrs().filter.linksFrom);

  return () => {
    return streamRefLabel(
      attrs(),
      (id) => (id === attrs().filter.backlinksTo ? backlinksTo() : linksFrom()) ?? id,
    );
  };
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
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        if (scroll.scrollToPane(input()).found) event.preventDefault();
      }}
    >
      {label()}
    </Link>
  );
}

export function createRecordLabel(id: () => RecordSchema.Id | undefined) {
  const idAtom = createSyncedAtom(id);

  const label = createAtomStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const recordId = get(idAtom);

        if (!recordId) return Stream.succeed(undefined);

        return RecordCache.Service.use((cache) => cache.changes(recordId)).pipe(
          Stream.unwrap,
          Stream.map((record) => Option.getOrUndefined(Option.map(record, RecordFormat.label))),
        );
      });
    }),
    undefined,
  );

  return () => label.value;
}
