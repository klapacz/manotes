import { useAtomValue } from "./atom-solid";
import { AsyncResult } from "effect/reactivity";
import { createMemo } from "solid-js";
import { Filters } from "@manotes/shared/record/filters";
import { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { PropDef } from "@manotes/shared/prop-def.service";
import { EffectStream } from "@manotes/shared/effect/stream";
import { Array, Effect, Option, Record, Stream } from "effect";
import { bindRt } from "./rt-atom";
import { createAtomStore, createSyncedAtom } from "./primitives";
import { RecordCache } from "./record-cache.service";
import { RecordFormat } from "./record";

const registry = bindRt((rt) => {
  return rt.atom(
    Effect.all({
      defs: PropDef.Service.use((service) => service.reactiveDefs()),
      presets: PresetRecordRepo.Service.use((repo) => repo.reactiveDefs()),
    }).pipe(
      Effect.map(({ defs, presets }) => {
        return Stream.zipLatestWith(defs, presets, (defs, presets) => ({
          filters: Filters.fromDefinitions(defs),
          presets,
        }));
      }),
      Stream.unwrap,
    ),
  );
});

export function useFilters() {
  const state = useAtomValue(registry);

  return createMemo(() => {
    const result = state();

    return AsyncResult.isSuccess(result) ? result.value.filters : Filters.builtin;
  });
}

export function usePresets() {
  const state = useAtomValue(registry);

  return createMemo((): readonly PresetRecordRepo.Def[] => {
    const result = state();

    return AsyncResult.isSuccess(result) ? result.value.presets : [];
  });
}

export function resolveFilterLabels(labels: readonly Filters.DisplayLabel[]) {
  const ids = Array.dedupe(Array.flatMap(labels, Filters.labelRecords));

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
      return labels.map((part) => {
        return Filters.renderLabel(part, (id) => {
          return Record.get(records, id).pipe(
            Option.flatten,
            Option.match({ onNone: () => id, onSome: RecordFormat.label }),
          );
        });
      });
    }),
  );
}

export function createFilterLabels(labels: () => readonly Filters.DisplayLabel[]) {
  const source = createSyncedAtom(labels);

  const state = createAtomStore(
    bindRt((rt) => {
      return rt.atom((get) => resolveFilterLabels(get(source)));
    }),
    [],
  );

  return () => state.value;
}
