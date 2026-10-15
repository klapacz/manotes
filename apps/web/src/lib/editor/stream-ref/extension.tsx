import { RecordSchema } from "@manotes/shared/record.schema";
import { Link } from "@tanstack/solid-router";
import { Array, Match, Option, pipe, Record, Stream } from "effect";
import { EffectStream } from "@manotes/shared/effect/stream";
import { defineSolidNodeView, type SolidNodeViewProps } from "prosekit/solid";
import { createMemo } from "solid-js";
import { bindRt, createAtomStore, createSyncedAtom } from "../..";
import { RecordCache } from "../../record-cache.service";
import { RecordFormat } from "../../record";
import { PaneCursor } from "../../record/pane.cursor";
import { PaneCtx } from "../../record/pane.ctx";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { PaneScroll } from "../../record/pane.scroll";
import { StreamRefSpec } from "@manotes/shared/editor/stream-ref/spec";

export function defineStreamRefRuntime() {
  return defineSolidNodeView({ name: "streamRef", component: StreamRefView });
}

export function createStreamRefLabel(attrs: () => StreamRefSpec.Attrs) {
  const parts = createMemo(() => StreamRefSpec.labels(attrs()));
  const partsAtom = createSyncedAtom(parts);

  const label = createAtomStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const current = get(partsAtom);

        return Stream.concat(
          Stream.succeed(StreamRefSpec.renderLabels(current)),
          watchLabels(current),
        );
      });
    }),
    StreamRefSpec.renderLabels(parts()),
  );

  return () => label.value;
}

function watchLabels(parts: readonly StreamRefSpec.Label[]) {
  const ids = pipe(
    parts,
    Array.filterMap((part) => {
      return Match.value(part).pipe(
        Match.tag("Record", ({ id }) => id),
        Match.result,
      );
    }),
    Array.dedupe,
  );

  const streams = Record.fromEntries(
    Array.map(ids, (id) => {
      const preview = RecordCache.Service.use((cache) => {
        return cache.changes(id);
      }).pipe(Stream.unwrap);

      return [id, preview] as const;
    }),
  );

  return EffectStream.zipLatestRecord(streams).pipe(
    Stream.map((records) => {
      return StreamRefSpec.renderLabels(parts, (id) => {
        return Record.get(records, id).pipe(
          Option.flatten,
          Option.match({
            onNone: () => id,
            onSome: RecordFormat.label,
          }),
        );
      });
    }),
  );
}

function StreamRefView(props: SolidNodeViewProps) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const attrs = createMemo(() => StreamRefSpec.decodeAttrs(props.node.attrs));
  const label = createStreamRefLabel(attrs);
  const input = () => PaneSchema.make.stream(attrs());

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
