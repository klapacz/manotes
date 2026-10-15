import { useAtom } from "@effect/atom-solid";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { RuleProps } from "@manotes/shared/rule-props";
import { Array, Data, Effect, Exit, Option, Record } from "effect";
import { Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { NoteLabel } from "./note-label";
import { NotePropsEntries } from "./note-props.entries";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";

export type Action = Data.TaggedEnum<{
  OpenProperty: { readonly selection: NotePropsEntries.Selection };
  SetProperty: {
    readonly selection: NotePropsEntries.Selection;
    readonly propVal: AttrsSchema.PropVal;
  };
}>;

export const Action = Data.taggedEnum<Action>();

export type Choice = Picker.Choice & Action;

export function query(opts: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc | undefined }) {
  return (request: QueryEngine.Request) => {
    const doc = opts.doc;

    if (!doc) return Stream.succeed([]);

    return NotePropsEntries.watch({ recordId: opts.recordId, doc }).pipe(
      Stream.switchMap((groups) => makeQuery(groups)(request)),
    );
  };
}

export function Menu(props: {
  readonly noteId: NoteSchema.Id;
  readonly doc: Y.Doc;
  readonly selection: NotePropsEntries.Selection;
  readonly onBack: () => void;
  readonly onOpenNote: (id: NoteSchema.Id) => void;
}) {
  const input = createSyncedAtom(() => ({
    recordId: props.noteId,
    doc: props.doc,
    selection: props.selection,
  }));

  const state = createAtomResultStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const { recordId, doc, selection } = get(input);

        return NotePropsEntries.watch({ recordId, doc }).pipe(
          Stream.map((groups) => {
            return NotePropsEntries.find({ groups, selection });
          }),
        );
      });
    }),
  );

  return (
    <MatchTag
      when={state}
      cases={{
        Loading: () => <p class="px-3 py-2 text-sm text-fg-subtle">Loading property…</p>,
        Error: () => <p class="px-3 py-2 text-sm text-error-fg">Unable to load property.</p>,
        Success: (result) => {
          return (
            <Show
              when={Option.getOrUndefined(result().value)}
              fallback={
                <PropPicker.Unavailable>
                  <Picker.Footer>
                    <Picker.Back onSelect={props.onBack} />
                  </Picker.Footer>
                </PropPicker.Unavailable>
              }
            >
              {(entry) => {
                return (
                  <ValueMenu
                    entry={entry()}
                    recordId={props.noteId}
                    doc={props.doc}
                    onBack={props.onBack}
                    onOpenNote={props.onOpenNote}
                    onChanged={(value) => {
                      if (value === undefined) props.onBack();
                    }}
                  />
                );
              }}
            </Show>
          );
        },
      }}
    />
  );
}

export function EntryValue(props: { readonly entry: NotePropsEntries.Entry }) {
  const required = () => RuleProps.isRequired(props.entry);
  const invalid = () => Attrs.ValueState.$is("Invalid")(props.entry.value);

  const unexpected = () => {
    return (
      RuleProps.EditorGroup.$is("Rule")(props.entry.group) && RuleProps.isUnexpected(props.entry)
    );
  };

  return (
    <span
      classList={{
        "text-error-fg": invalid() || required(),
        "text-warning-fg": unexpected() && !invalid() && !required(),
      }}
    >
      <Show when={unexpected()}>Unexpected: </Show>
      <Show when={required()} fallback={<PropPicker.StateLabel state={props.entry.value} />}>
        Required
      </Show>
    </span>
  );
}

export function ValueMenu(props: {
  readonly entry: NotePropsEntries.Entry;
  readonly recordId: NoteSchema.Id;
  readonly doc: Y.Doc;
  readonly onBack: () => void;
  readonly onOpenNote: (id: NoteSchema.Id) => void;
  readonly onChanged: (value: AttrsSchema.PropVal | undefined) => void;
}) {
  const [mutation, edit] = useAtom(Edit, { mode: "promiseExit" });

  const change = async (value: AttrsSchema.PropVal | undefined) => {
    const exit = await edit({
      doc: props.doc,
      recordId: props.recordId,
      selection: NotePropsEntries.selection(props.entry),
      value,
    });

    if (Exit.isFailure(exit)) return;

    props.onChanged(value);
  };

  return (
    <Show
      when={Option.getOrUndefined(props.entry.def)}
      fallback={
        <PropPicker.Unavailable>
          <Show when={AsyncResult.isFailure(mutation())}>
            <p role="alert" class="px-3 py-2 text-sm text-error-fg">
              Unable to update property.
            </p>
          </Show>
          <Picker.Footer>
            <Picker.Back onSelect={props.onBack} />
            <Picker.Clear
              disabled={Attrs.ValueState.$is("Unset")(props.entry.value) || mutation().waiting}
              onSelect={() => void change(undefined)}
            />
          </Picker.Footer>
        </PropPicker.Unavailable>
      }
    >
      {(def) => {
        return (
          <PropPicker.Value
            propId={props.entry.propId}
            label={NotePropsEntries.label(props.entry)}
            type={def().prop_type}
            targets={PropQuery.targets(def())}
            defaultValue={Option.fromNullishOr(def().prop_default)}
            state={props.entry.value}
            disabled={mutation().waiting}
            onChange={(value) => void change(value)}
            onOpenNote={props.onOpenNote}
          >
            {(items) => {
              return (
                <CommandList>
                  <CommandScroll>{items}</CommandScroll>
                  <PropPicker.Invalid state={props.entry.value} />
                  <Show when={AsyncResult.isFailure(mutation())}>
                    <p role="alert" class="px-3 py-2 text-sm text-error-fg">
                      Unable to update property.
                    </p>
                  </Show>
                  <Picker.Footer>
                    <Picker.Back onSelect={props.onBack} />
                    <Picker.Clear
                      disabled={
                        Attrs.ValueState.$is("Unset")(props.entry.value) || mutation().waiting
                      }
                      onSelect={() => void change(undefined)}
                    />
                  </Picker.Footer>
                </CommandList>
              );
            }}
          </PropPicker.Value>
        );
      }}
    </Show>
  );
}

export const Edit = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsNoteNoteProps.edit")(function* (opts: {
      readonly doc: Y.Doc;
      readonly recordId: NoteSchema.Id;
      readonly selection: NotePropsEntries.Selection;
      readonly value: AttrsSchema.PropVal | undefined;
    }) {
      const attrs = yield* Attrs.Service;
      const prop = { doc: opts.doc, propId: opts.selection.propId };

      yield* NotePropsEntries.Selection.$match(opts.selection, {
        Top: () => {
          if (opts.value === undefined) return attrs.clearProp(prop);

          return attrs.setProp({ ...prop, recordId: opts.recordId, value: opts.value });
        },
        Rule: ({ ruleId }) => {
          if (opts.value === undefined) {
            return attrs.clearGroupProp({ ...prop, ruleId });
          }

          return attrs.setGroupProp({
            ...prop,
            recordId: opts.recordId,
            ruleId,
            value: opts.value,
          });
        },
      });
    }),
  );
});

function makeQuery(groups: RuleProps.EditorGroups) {
  // Keep each group's props together, with top-level props first.
  const entries = Array.flatMap(
    [groups.top, ...Record.values(groups.groups)],
    NotePropsEntries.entries,
  );

  const combined = QueryEngine.combine([
    // Match prop names and offer their value pickers.
    MenuQuery.choices(() => Array.map(entries, openChoice)),
    // Also search values, such as Task → Priority → High.
    ...Array.map(entries, valueQuery),
  ]);

  return (request: QueryEngine.Request) => {
    return combined(request).pipe(
      Stream.map((matches) => {
        if (request.text.trim()) return matches;

        // Browsing uses headings for context and places props below note actions.
        return Array.map(matches, (match) => {
          return { ...match, score: 0.5, value: { ...match.value, path: [] } };
        });
      }),
    );
  };
}

function openChoice(entry: NotePropsEntries.Entry): Choice {
  const selection = NotePropsEntries.selection(entry);
  const section = groupKey(entry.group);
  const label = NotePropsEntries.label(entry);

  const path = RuleProps.EditorGroup.$match(entry.group, {
    Top: () => [],
    Rule: ({ status }) => [NotePropsEntries.ruleLabel(status)],
  });

  return {
    ...Action.OpenProperty({ selection }),
    value: `${section}:${entry.propId}`,
    group: section,
    groupLabel: () => <GroupLabel group={entry.group} />,
    label,
    path,
    keywords: [[...path, label].join(" ")],
    labelSuffix: <PropPicker.BuiltinBadge builtin={BuiltinAttrs.isBuiltin(entry.propId)} />,
    detail: () => <EntryValue entry={entry} />,
    suffix: <Picker.Caret />,
  };
}

function groupKey(group: RuleProps.EditorGroup) {
  return RuleProps.EditorGroup.$match(group, {
    Top: () => "props",
    Rule: ({ ruleId }) => `rule:${ruleId}`,
  });
}

function GroupLabel(props: { readonly group: RuleProps.EditorGroup }) {
  return (
    <MatchTag
      when={props.group}
      cases={{
        Top: () => <>Properties</>,
        Rule: (group) => {
          return (
            <span class="flex items-center gap-2">
              <MatchTag
                when={group().status}
                cases={{
                  Matching: (status) => <>{NotePropsEntries.ruleLabel(status())}</>,
                  Unmatched: (status) => <>{NotePropsEntries.ruleLabel(status())}</>,
                  Unavailable: () => <NoteLabel.Root id={group().ruleId} />,
                }}
              />
              <MatchTag
                when={group().status}
                cases={{
                  Unmatched: () => <span class="text-warning-fg">No longer applies</span>,
                  Unavailable: () => <span class="text-error-fg">Rule unavailable</span>,
                }}
              />
            </span>
          );
        },
      }}
    />
  );
}

function valueQuery(entry: NotePropsEntries.Entry) {
  // Available definitions supply the type, defaults, and reference scope.
  if (Option.isNone(entry.def)) return () => Stream.succeed([]);

  const def = entry.def.value;
  const selection = NotePropsEntries.selection(entry);

  const query = MenuQuery.nested({
    label: NotePropsEntries.label(entry),
    query: QueryEngine.map(
      PropQuery.values({
        propId: entry.propId,
        type: def.prop_type,
        targets: PropQuery.targets(def),
        defaultValue: Option.fromNullishOr(def.prop_default),
      }),
      (choice): Choice => {
        return {
          ...choice,
          ...Action.SetProperty({ selection, propVal: choice.propVal }),
          value: `${groupKey(entry.group)}:${entry.propId}:${choice.value}`,
          group: groupKey(entry.group),
          labelSuffix: <PropPicker.BuiltinBadge builtin={BuiltinAttrs.isBuiltin(entry.propId)} />,
        };
      },
    ),
  });

  return withGroupPath({ group: entry.group, query });
}

function withGroupPath<E, R>(opts: {
  readonly group: RuleProps.EditorGroup;
  readonly query: QueryEngine.Query<Choice, E, R>;
}) {
  return RuleProps.EditorGroup.$match(opts.group, {
    Top: () => opts.query,
    Rule: (group) => {
      return MenuQuery.nested({
        label: NotePropsEntries.ruleLabel(group.status),
        query: opts.query,
      });
    },
  });
}

export * as NoteProps from "./note-props";
