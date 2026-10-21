import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/reactivity";
import { createMemo } from "solid-js";
import { Filters } from "@manotes/shared/record/filters";
import { PropDef } from "@manotes/shared/prop-def.service";
import { EffectStream } from "@manotes/shared/effect/stream";
import { Array, Option, Record, Stream } from "effect";
import { bindRt } from "./rt-atom";
import { createAtomStore, createSyncedAtom } from "./primitives";
import { RecordCache } from "./record-cache.service";
import { RecordFormat } from "./record";

const registry = bindRt((rt) => {
  return rt.atom(
    PropDef.Service.use((service) => service.reactiveDefs()).pipe(
      Stream.unwrap,
      Stream.map(Filters.fromDefinitions),
    ),
  );
});

export function useFilters() {
  const state = useAtomValue(registry);

  return createMemo(() => {
    const result = state();

    return AsyncResult.isSuccess(result) ? result.value : Filters.builtin;
  });
}

export function createFilterLabels(labels: () => readonly Filters.DisplayLabel[]) {
  const source = createSyncedAtom(labels);

  const state = createAtomStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const parts = get(source);
        const ids = Array.dedupe(Array.flatMap(parts, Filters.labelRecords));

        const streams = Record.fromEntries(
          ids.map((id) => {
            return [
              id,
              RecordCache.Service.use((cache) => cache.changes(id)).pipe(Stream.unwrap),
            ] as const;
          }),
        );

        return EffectStream.zipLatestRecord(streams).pipe(
          Stream.map((records) => {
            return parts.map((part) => {
              return Filters.renderLabel(part, (id) => {
                return Record.get(records, id).pipe(
                  Option.flatten,
                  Option.match({ onNone: () => id, onSome: RecordFormat.label }),
                );
              });
            });
          }),
        );
      });
    }),
    [],
  );

  return () => state.value;
}
