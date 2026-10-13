import { Data, Effect, Match, Option, Record, Result, Stream, type Types, pipe } from "effect";
import type * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { NoteSchema } from "./note.schema";
import { PropDef } from "./prop-def.service";
import { PropRecordRepo } from "./prop-record.repo";
import { RuleExpect } from "./rule-expect";
import { RuleMatches } from "./rule-matches";

export type GroupStatus = Data.TaggedEnum<{
  // The saved group's owning rule has no available definition.
  Unavailable: {};
  // The owning rule matches this record and expects values in its group.
  Matching: { readonly rule: RuleMatches.Rule };
  // The rule exists, but does not match this record or now uses top-level storage.
  Unmatched: { readonly rule: RuleMatches.Rule };
}>;

export const GroupStatus = Data.taggedEnum<GroupStatus>();

export type Prop = {
  readonly propId: NoteSchema.Id;
  readonly def: Option.Option<PropRecordRepo.Def>;
  readonly expectation: Option.Option<AttrsSchema.RuleExpectation>;
  readonly value: Attrs.ValueState<AttrsSchema.PropVal>;
};

export type EditorGroup = Data.TaggedEnum<{
  Top: { readonly props: Readonly<Record<NoteSchema.Id, Prop>> };
  Rule: {
    readonly ruleId: NoteSchema.Id;
    readonly status: GroupStatus;
    readonly props: Readonly<Record<NoteSchema.Id, Prop>>;
  };
}>;

export const EditorGroup = Data.taggedEnum<EditorGroup>();

export type EditorGroups = {
  readonly top: Types.ExtractTag<EditorGroup, "Top">;
  readonly groups: Readonly<Record<NoteSchema.Id, Types.ExtractTag<EditorGroup, "Rule">>>;
};

type Expected = ReturnType<typeof RuleExpect.reduceExpects>;

type SavedProps = Readonly<Record<NoteSchema.Id, Attrs.ValueState<AttrsSchema.PropVal>>>;

export type Saved = {
  readonly top: SavedProps;
  readonly groups: Readonly<Record<NoteSchema.Id, SavedProps>>;
};

export type Expectations = {
  readonly top: Expected;
  readonly groups: Readonly<
    Record<NoteSchema.Id, { readonly status: GroupStatus; readonly expects: Expected }>
  >;
};

export function watch(opts: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const attrs = yield* Attrs.Service;
      const definitions = yield* PropDef.Service;
      const rows = yield* definitions.reactiveDefs();

      // Index repository rows once for both value validation and editor metadata.
      const defs = rows.pipe(Stream.map(PropDef.asRecord));

      const expectations = RuleMatches.watch({ recordId: opts.recordId }).pipe(
        Stream.map(collectExpectations),
      );

      const saved = attrs.watchGroups({ doc: opts.doc, defs });

      return Stream.zipLatestWith(expectations, saved, (expectations, { saved, defs }) => {
        return { groups: reconcileGroups({ expectations, saved, defs }), defs };
      });
    }),
  );
}

export function collectExpectations(rules: Readonly<Record<NoteSchema.Id, RuleMatches.Rule>>) {
  const [matching, unmatched] = Record.partition(rules, (rule) => {
    return Match.value(rule.status).pipe(
      Match.tag("Matching", () => Result.succeed(rule)),
      Match.tag("Unmatched", () => Result.fail(rule)),
      Match.exhaustive,
    );
  });

  const [groupRules, topRules] = Record.partition(matching, (rule) => {
    return Match.value(rule.rule_storage).pipe(
      Match.tag("top", () => Result.fail(rule)),
      Match.tag("group", () => Result.succeed(rule)),
      Match.exhaustive,
    );
  });

  const top = pipe(
    topRules,
    Record.collect((_, rule) => rule.expects),
    RuleExpect.createReducer().combineAll,
  );

  // These owners remain available, but have no active group expectations.
  const unmatchedGroups = pipe(
    Record.union(unmatched, topRules, (rule) => rule),
    Record.map((rule) => ({
      status: GroupStatus.Unmatched({ rule }),
      expects: {},
    })),
  );

  const matchingGroups = Record.map(groupRules, (rule) => ({
    status: GroupStatus.Matching({ rule }),
    expects: rule.expects,
  }));

  return {
    top,
    groups: Record.union(unmatchedGroups, matchingGroups, (_, matching) => matching),
  };
}

export function reconcileGroups(opts: {
  readonly expectations: Expectations;
  readonly saved: Saved;
  readonly defs: Attrs.Defs;
}): EditorGroups {
  // Enrich each saved group with its owning rule and current status.
  const existing = Record.map(opts.saved.groups, (saved, ruleId) => {
    return reconcileRuleGroup({
      ruleId,
      saved,
      defs: opts.defs,
      expectation: Record.get(opts.expectations.groups, ruleId),
    });
  });

  const additional = pipe(
    opts.expectations.groups,
    // Matching groups also appear before any of their values have been saved.
    Record.filter((group) => GroupStatus.$is("Matching")(group.status)),
    Record.map((group, ruleId) => {
      return reconcileRuleGroup({
        ruleId,
        saved: {},
        defs: opts.defs,
        expectation: Option.some(group),
      });
    }),
  );

  return {
    top: EditorGroup.Top({
      props: reconcileProps({
        saved: opts.saved.top,
        expects: opts.expectations.top,
        defs: opts.defs,
      }),
    }),
    // Saved groups retain their values when a matching empty group shares the ID.
    groups: Record.union(existing, additional, (existing) => existing),
  };
}

export function isUnexpected(prop: Prop) {
  return Option.isNone(prop.expectation) && !Attrs.ValueState.$is("Unset")(prop.value);
}

export function isRequired(prop: Prop) {
  return (
    Attrs.ValueState.$is("Unset")(prop.value) &&
    Option.exists(prop.expectation, AttrsSchema.RuleExpectation.guards.required)
  );
}

function reconcileRuleGroup(opts: {
  readonly ruleId: NoteSchema.Id;
  readonly saved: SavedProps;
  readonly defs: Attrs.Defs;
  readonly expectation: Option.Option<Expectations["groups"][NoteSchema.Id]>;
}) {
  const { status, expects } = opts.expectation.pipe(
    Option.match({
      // Preserve saved props when their owning rule is unavailable.
      onNone: () => ({
        status: GroupStatus.Unavailable(),
        expects: {},
      }),
      onSome: (group) => group,
    }),
  );

  return EditorGroup.Rule({
    ruleId: opts.ruleId,
    status,
    props: reconcileProps({ saved: opts.saved, expects, defs: opts.defs }),
  });
}

function reconcileProps(opts: {
  readonly saved: SavedProps;
  readonly expects: Expected;
  readonly defs: Attrs.Defs;
}) {
  const savedProps = Record.map(opts.saved, (value, propId) => ({
    propId,
    def: Record.get(opts.defs, propId),
    expectation: Option.none<AttrsSchema.RuleExpectation>(),
    value,
  }));

  const expectedProps = Record.map(opts.expects, (expectation, propId) => ({
    propId,
    def: Record.get(opts.defs, propId),
    expectation: Option.some(expectation),
    value: Attrs.ValueState.Unset(),
  }));

  // Shared IDs combine expectation metadata with the already-validated saved state.
  return Record.union(savedProps, expectedProps, (saved, expected) => ({
    ...expected,
    value: saved.value,
  }));
}

export * as RuleProps from "./rule-props";
