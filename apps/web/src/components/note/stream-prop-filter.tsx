import { PropDef } from "@manotes/shared/prop-def.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { keyArray } from "@solid-primitives/keyed";
import { Array, Option, Stream, type Cause } from "effect";
import { createMemo, Show } from "solid-js";
import { bindRt, createAtomStore } from "../../lib";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";
import { PropState } from "./prop-state";
import { StreamPropFilterEntries } from "./stream-prop-filter.entries";

type Def = PropQuery.Def;

export type Entry = StreamPropFilterEntries.Entry & {
  readonly error: Cause.Cause<unknown> | undefined;
};

export function use(opts: {
  filter: () => StreamSettings.Filter;
  propId: () => AttrsSchema.NoteId | undefined;
  onChange: (filter: StreamSettings.Filter) => void;
}) {
  const defs = useDefs();

  const rawEntries = createMemo(() =>
    StreamPropFilterEntries.make({ defs: defs(), filter: opts.filter() }),
  );

  const validated = keyArray(
    rawEntries,
    (entry) => entry.id,
    (entry) => {
      const validation = PropState.use({
        state: () => entry().state,
        targets: () => PropQuery.targets(entry().def),
      });

      return createMemo(() => ({
        ...entry(),
        state: validation.state(),
        error: validation.error(),
      }));
    },
  );

  const entries = createMemo(() => validated().map((entry) => entry()));

  const enums = createMemo(() => entries().filter((entry) => entry.def.prop_type === "enum"));

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

  return { entries, enums, selected, modified, set };
}

function useDefs() {
  const initial = { defs: Array.empty<Def>() };

  const state = createAtomStore(
    bindRt((rt) =>
      rt.atom(
        PropDef.Service.use((repo) => repo.reactiveDefs()).pipe(
          Stream.unwrap,
          Stream.map((defs) => ({ defs: Array.filterMap(defs, PropQuery.editableDef) })),
        ),
      ),
    ),
    initial,
  );

  return () => state.value.defs;
}

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
      return <PropPicker.BuiltinBadge builtin={BuiltinAttrs.isBuiltin(entry.id)} />;
    },
    suffix: <Picker.Caret />,
    modified: entry.modified,
    detail: entry.detail === undefined ? undefined : () => <ValueLabel entry={entry} />,
    run: (search) => opts.onOpen(entry.id, search),
  }));

  return QueryEngine.combine([
    MenuQuery.actions(() => actions),
    ...opts.entries.map((entry) =>
      MenuQuery.nested({
        label: entry.label,
        query: QueryEngine.map(
          PropQuery.values({
            propId: entry.id,
            type: entry.def.prop_type,
            targets: PropQuery.targets(entry.def),
            defaultValue: Option.fromNullishOr(entry.def.prop_default),
          }),
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

export function ValueLabel(props: { entry: Entry }) {
  return (
    <Show when={Option.isSome(props.entry.value)} fallback={props.entry.detail}>
      <span classList={{ "text-error-fg": Attrs.ValueState.$is("Invalid")(props.entry.state) }}>
        <PropPicker.StateLabel state={props.entry.state} />
      </span>
    </Show>
  );
}

export function Menu(props: {
  entry: Entry;
  search?: string;
  onChange: (value: AttrsSchema.PropVal) => void;
  onBack: () => void;
  onClear: () => void;
  onOpenNote: (id: AttrsSchema.NoteId) => void;
}) {
  const state = () => props.entry.state;

  const footer = () => (
    <Picker.Footer>
      <Picker.Back onSelect={props.onBack} />
      <Picker.Clear disabled={!props.entry.canClear} onSelect={props.onClear} />
    </Picker.Footer>
  );

  return (
    <PropPicker.Value
      propId={props.entry.id}
      label={props.entry.label}
      type={props.entry.def.prop_type}
      targets={PropQuery.targets(props.entry.def)}
      defaultValue={Option.fromNullishOr(props.entry.def.prop_default)}
      state={state()}
      search={props.search}
      onChange={props.onChange}
      onOpenNote={props.onOpenNote}
    >
      {(items) => (
        <CommandList>
          <CommandScroll>{items}</CommandScroll>
          <PropPicker.Invalid state={state()} />
          <Show when={props.entry.error}>
            <p role="alert" class="px-3 py-2 text-sm text-error-fg">
              Unable to validate reference.
            </p>
          </Show>
          {footer()}
        </CommandList>
      )}
    </PropPicker.Value>
  );
}

export * as StreamPropFilter from "./stream-prop-filter";
