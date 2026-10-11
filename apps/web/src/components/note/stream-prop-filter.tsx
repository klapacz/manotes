import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Array, Match, Stream } from "effect";
import { createMemo } from "solid-js";
import { bindRt, createAtomStore } from "../../lib";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";
import { StreamPropFilterEntries } from "./stream-prop-filter.entries";

type Def = PropRecordRepo.Def<"bool">;

export type Entry = StreamPropFilterEntries.Entry;

export function use(opts: {
  filter: () => StreamSettings.Filter;
  propId: () => AttrsSchema.NoteId | undefined;
  onChange: (filter: StreamSettings.Filter) => void;
}) {
  const defs = useDefs();

  const entries = createMemo(() =>
    StreamPropFilterEntries.make({ defs: defs(), filter: opts.filter() }),
  );

  const selected = createMemo(() => entries().find((entry) => entry.id === opts.propId()));
  const modified = createMemo(() => entries().some((entry) => entry.modified));

  const set = (update: {
    propId: AttrsSchema.NoteId;
    value: AttrsSchema.PropVal | undefined;
    close?: () => void;
  }) => {
    opts.onChange(StreamSettings.changePropFilter(opts.filter(), update));
    update.close?.();
  };

  return { entries, selected, modified, set };
}

function useDefs() {
  const initial = { defs: Array.empty<Def>() };

  const state = createAtomStore(
    bindRt((rt) =>
      rt.atom(
        PropRecordRepo.Service.use((repo) => repo.reactiveDefs()).pipe(
          Stream.unwrap,
          Stream.map((defs) => ({ defs: Array.filterMap(defs, boolDef) })),
        ),
      ),
    ),
    initial,
  );

  return () => state.value.defs;
}

const boolDef = Match.type<PropRecordRepo.Def>().pipe(
  Match.when({ prop_type: "bool" }, (def) => def),
  Match.result,
);

export function query(opts: {
  entries: readonly Entry[];
  onOpen: (propId: Def["id"], search?: string) => void;
  onSet: (propId: Def["id"], value: AttrsSchema.PropVal) => void;
}) {
  const actions: readonly MenuQuery.Action[] = opts.entries.map((entry) => ({
    value: `prop:${entry.id}`,
    label: entry.label,
    group: "properties",
    get labelSuffix() {
      return <PropPicker.BuiltinBadge builtin={entry.def.builtin} />;
    },
    suffix: <Picker.Caret />,
    modified: entry.modified,
    detail: entry.detail === undefined ? undefined : () => entry.detail,
    run: (search) => opts.onOpen(entry.id, search),
  }));

  return QueryEngine.combine([
    MenuQuery.actions(() => actions),
    ...opts.entries.map((entry) =>
      MenuQuery.nested({
        label: entry.label,
        query: QueryEngine.map(
          PropQuery.boolQuery({ defaultValue: entry.def.prop_default?.val }),
          (choice) => ({
            ...choice,
            group: "properties",
            value: `prop:${entry.id}:${choice.value}`,
            run: () => opts.onSet(entry.id, choice.propVal),
          }),
        ),
      }),
    ),
  ]);
}

export function Menu(props: {
  entry: Entry;
  search?: string;
  onChange: (value: AttrsSchema.PropVal) => void;
  onBack: () => void;
  onClear: () => void;
}) {
  const footer = () => (
    <Picker.Footer>
      <Picker.Back onSelect={props.onBack} />
      <Picker.Clear disabled={!props.entry.canClear} onSelect={props.onClear} />
    </Picker.Footer>
  );

  return (
    <PropPicker.Bool
      def={props.entry.def}
      value={props.entry.value}
      search={props.search}
      onChange={props.onChange}
    >
      {(items) => (
        <CommandList>
          <CommandScroll>{items}</CommandScroll>
          {footer()}
        </CommandList>
      )}
    </PropPicker.Bool>
  );
}

export * as StreamPropFilter from "./stream-prop-filter";
