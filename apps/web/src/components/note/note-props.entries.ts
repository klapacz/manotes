import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { PropDef } from "@manotes/shared/prop-def.service";
import { RuleProps } from "@manotes/shared/rule-props";
import { Data, Effect, Option, Record, Stream, pipe } from "effect";
import type * as Y from "yjs";

export type Selection = Data.TaggedEnum<{
  Top: { readonly propId: NoteSchema.Id };
  Rule: { readonly ruleId: NoteSchema.Id; readonly propId: NoteSchema.Id };
}>;

export const Selection = Data.taggedEnum<Selection>();

export type Entry = RuleProps.Prop & {
  readonly group: RuleProps.EditorGroup;
};

export function watch(opts: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const definitions = yield* PropDef.Service;
      const defs = yield* definitions.reactiveDefs();

      return Stream.zipLatestWith(
        RuleProps.watch(opts),
        defs.pipe(Stream.map(PropDef.asRecord)),
        (groups, defs) => {
          return includeUnusedDefs({ groups, defs, recordId: opts.recordId });
        },
      );
    }),
  );
}

export function includeUnusedDefs(opts: {
  readonly groups: RuleProps.EditorGroups;
  readonly defs: Attrs.Defs;
  readonly recordId: NoteSchema.Id;
}) {
  const additional = pipe(
    opts.defs,
    // Offer unused definitions, excluding the record's own definition.
    Record.filter((def) => {
      return def.id !== opts.recordId && !Record.has(opts.groups.top.props, def.id);
    }),
    Record.map((def) => {
      return {
        propId: def.id,
        def: Option.some(def),
        expectation: Option.none<AttrsSchema.RuleExpectation>(),
        value: Attrs.ValueState.Unset(),
      };
    }),
  );

  return {
    top: RuleProps.EditorGroup.Top({
      props: Record.union(opts.groups.top.props, additional, (existing) => existing),
    }),
    groups: opts.groups.groups,
  };
}

export function entries(group: RuleProps.EditorGroup): readonly Entry[] {
  return Record.collect(group.props, (_, prop) => ({ ...prop, group }));
}

export function selection(entry: Entry) {
  return RuleProps.EditorGroup.$match(entry.group, {
    Top: () => Selection.Top({ propId: entry.propId }),
    Rule: ({ ruleId }) => Selection.Rule({ ruleId, propId: entry.propId }),
  });
}

export function label(prop: RuleProps.Prop) {
  return Option.match(prop.def, {
    onNone: () => "Unavailable property",
    onSome: (def) => def.title || "Untitled",
  });
}

export function ruleLabel(status: RuleProps.GroupStatus) {
  return RuleProps.GroupStatus.$match(status, {
    Matching: ({ rule }) => rule.title || "Untitled",
    Unmatched: ({ rule }) => rule.title || "Untitled",
    Unavailable: () => "Rule unavailable",
  });
}

export function find(opts: {
  readonly groups: RuleProps.EditorGroups;
  readonly selection: Selection;
}): Option.Option<Entry> {
  const group = Selection.$match(opts.selection, {
    Top: () => Option.some(opts.groups.top),
    Rule: ({ ruleId }) => Record.get(opts.groups.groups, ruleId),
  });

  return group.pipe(
    Option.flatMap((group) => {
      return Record.get(group.props, opts.selection.propId).pipe(
        Option.map((prop) => ({ ...prop, group })),
      );
    }),
  );
}

export * as NotePropsEntries from "./note-props.entries";
