import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { Attrs } from "@manotes/shared/attrs.service";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { Option, Record } from "effect";
import { PropQuery } from "./prop-query";

export type Entry = {
  readonly id: AttrsSchema.NoteId;
  readonly def: PropQuery.Def;
  readonly value: Option.Option<AttrsSchema.PropVal>;
  readonly state: Attrs.ValueState<AttrsSchema.PropVal>;
  readonly label: string;
  readonly detail: string | undefined;
  readonly modified: boolean;
  readonly showChip: boolean;
  readonly canClear: boolean;
};

export function make(opts: {
  defs: readonly PropQuery.Def[];
  filter: StreamSettings.Filter;
}): readonly Entry[] {
  const values = StreamSettings.propFilters(opts.filter);
  const changed = new Set(StreamSettings.changedProps(opts.filter));

  return opts.defs.map((def) => {
    const id = def.id;
    const value = Record.get(values, id);
    const modified = changed.has(id);

    return {
      id,
      def,
      value,
      state: PropQuery.valueState({ type: def.prop_type, value }),
      label: def.title || "Untitled",
      detail: appliedLabel({ value, modified }),
      modified,
      showChip: Option.isSome(value) && modified,
      canClear: Option.isSome(value),
    };
  });
}

function appliedLabel(opts: {
  value: Option.Option<AttrsSchema.PropVal>;
  modified: boolean;
}): string | undefined {
  return opts.value.pipe(
    Option.map(PropQuery.valueLabel),
    Option.getOrElse(() => {
      if (opts.modified) return "Any";

      return undefined;
    }),
  );
}

export * as StreamPropFilterEntries from "./stream-prop-filter.entries";
