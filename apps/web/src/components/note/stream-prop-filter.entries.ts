import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { Option, Record } from "effect";
import { PropQuery } from "./prop-query";

export type Entry = {
  readonly id: AttrsSchema.NoteId;
  readonly def: PropRecordRepo.Def<"bool">;
  readonly value: AttrsSchema.PropVal | undefined;
  readonly label: string;
  readonly detail: string | undefined;
  readonly modified: boolean;
  readonly showChip: boolean;
  readonly canClear: boolean;
};

export function make(opts: {
  defs: readonly PropRecordRepo.Def<"bool">[];
  filter: StreamSettings.Filter;
}): readonly Entry[] {
  const values = StreamSettings.propFilters(opts.filter);
  const changed = new Set(StreamSettings.changedProps(opts.filter));

  return opts.defs.map((def) => {
    const id = def.id;
    const value = Option.getOrUndefined(Record.get(values, id));
    const modified = changed.has(id);

    return {
      id,
      def,
      value,
      label: def.title || "Untitled",
      detail: appliedLabel({ value, modified }),
      modified,
      showChip: value !== undefined && modified,
      canClear: value !== undefined,
    };
  });
}

function appliedLabel(opts: {
  value: AttrsSchema.PropVal | undefined;
  modified: boolean;
}): string | undefined {
  if (opts.value !== undefined) return PropQuery.valueLabel(opts.value);

  if (opts.modified) return "Any";

  return undefined;
}

export * as StreamPropFilterEntries from "./stream-prop-filter.entries";
