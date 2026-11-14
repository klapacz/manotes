import { Array, Effect, Match, Option, Record, Result, Schema, Stream, pipe } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { PropRecordRepo } from "./prop-record.repo";
import { PropValidation } from "./prop-validation";
import { RecordRepo } from "./record.repo";
import { RecordSchema } from "./record.schema";
import { RecordFormat } from "./record/format";
import { RuleMatches } from "./rule-matches";
import { RuleProps } from "./rule-props";
import { RuleRecord } from "./rule-record.service";
import type * as Y from "yjs";

export const SetOp = Schema.Struct({
  kind: Schema.Literal("prop.set"),
  propId: RecordSchema.Id,
  ruleId: Schema.optionalKey(RecordSchema.Id),
  value: AttrsSchema.PropVal,
});

export type SetOp = typeof SetOp.Type;

export const ClearOp = Schema.Struct({
  kind: Schema.Literal("prop.clear"),
  propId: RecordSchema.Id,
  ruleId: Schema.optionalKey(RecordSchema.Id),
});

export type ClearOp = typeof ClearOp.Type;

export const Op = Schema.Union([SetOp, ClearOp]);

export type Op = typeof Op.Type;

export const apply = Effect.fn("ExecuteProps.apply")(function* (opts: {
  readonly doc: Y.Doc;
  readonly recordId: RecordSchema.Id;
  readonly op: Op;
}) {
  const attrs = yield* Attrs.Service;
  const prop = { doc: opts.doc, propId: opts.op.propId };
  const ruleId = opts.op.ruleId;

  yield* Match.value(opts.op).pipe(
    Match.when({ kind: "prop.set" }, (op) => {
      if (ruleId === undefined) {
        return attrs.setProp({ ...prop, recordId: opts.recordId, value: op.value });
      }

      return attrs.setGroupProp({ ...prop, recordId: opts.recordId, ruleId, value: op.value });
    }),
    Match.when({ kind: "prop.clear" }, () => {
      if (ruleId === undefined) return attrs.clearProp(prop);

      return attrs.clearGroupProp({ ...prop, ruleId });
    }),
    Match.exhaustive,
  );
});

export const ValueState = Schema.TaggedUnion({
  Unset: {},
  Valid: { value: AttrsSchema.PropVal },
  Invalid: { value: Schema.optionalKey(AttrsSchema.PropVal) },
});

export type ValueState = typeof ValueState.Type;

export const Value = Schema.Struct({
  state: ValueState,
  label: Schema.NullOr(Schema.String),
});

export type Value = typeof Value.Type;

export const Entry = Schema.Struct({
  propId: RecordSchema.Id,
  label: Schema.String,
  def: Schema.NullOr(PropRecordRepo.ValidDef),
  expectation: Schema.NullOr(AttrsSchema.RuleExpectation),
  value: Value,
});

export type Entry = typeof Entry.Type;

export const RuleGroup = Schema.Struct({
  ruleId: RecordSchema.Id,
  label: Schema.String,
  status: Schema.Literals(["Matching", "Unmatched", "Unavailable"]),
  props: Schema.Array(Entry),
});

export type RuleGroup = typeof RuleGroup.Type;

export const Groups = Schema.Struct({
  top: Schema.Array(Entry),
  groups: Schema.Array(RuleGroup),
});

export type Groups = typeof Groups.Type;

export const readDefault = Effect.fn("ExecuteProps.readDefault")(function* (opts: {
  readonly type: AttrsSchema.PropValTag | null;
  readonly value: AttrsSchema.PropVal | null;
  readonly targets: AttrsSchema.TargetFilter | null;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
}) {
  return yield* PropValidation.watch({
    state: PropValidation.valueState({
      type: Option.fromNullishOr(opts.type),
      value: Option.fromNullishOr(opts.value),
    }),
    targets: opts.targets ?? undefined,
  }).pipe(
    Stream.runHead,
    Effect.flatMap(Effect.fromOption),
    Effect.map((state) => toValue({ state, labels: opts.labels })),
  );
});

export const readSaved = Effect.fn("ExecuteProps.readSaved")(function* (opts: {
  readonly rows: RecordRepo.ListRecord["props"];
  readonly defs: Attrs.Defs;
}) {
  const rows = yield* pipe(
    opts.rows,
    Effect.forEach((row) => {
      return Match.value(row.value).pipe(
        Match.when(null, () => {
          return Effect.succeed(Attrs.ValueState.Invalid<never, AttrsSchema.PropVal>({}));
        }),
        Match.orElse((value) => {
          // Each valid link queries SQLite for target existence and scope.
          // Other value types use only the supplied def.
          return Attrs.watchProp({ value, def: Record.get(opts.defs, row.propId) }).pipe(
            Stream.runHead,
            Effect.flatMap(Effect.fromOption),
          );
        }),
        Effect.map((value) => ({ ...row, value })),
      );
    }),
  );

  // Success routes to `grouped`; Failure routes to `top`, not a validation error.
  const [grouped, top] = Array.partition(rows, (row) => {
    const ruleId = row.path[0];
    const entry = [row.propId, row.value] as const;

    if (ruleId === undefined) return Result.fail(entry);

    return Result.succeed({ ruleId, entry });
  });

  return {
    top: Record.fromEntries(top),
    groups: pipe(
      grouped,
      Array.groupBy((row) => row.ruleId),
      Record.map((rows) => {
        return pipe(
          rows,
          Array.map((row) => row.entry),
          Record.fromEntries,
        );
      }),
    ),
  } satisfies RuleProps.Saved;
});

export const readRules = Effect.fn("ExecuteProps.readRules")(function* (
  recordIds: readonly RecordSchema.Id[],
) {
  const ruleRecords = yield* RuleRecord.Service;
  const records = yield* RecordRepo.Service;

  const rules = yield* ruleRecords
    .reactiveRules()
    .pipe(Effect.flatMap(Stream.runHead), Effect.flatMap(Effect.fromOption));

  const recordIdsFilter = AttrsSchema.makeFilterExpr.or({
    val: Array.map(recordIds, (id) => AttrsSchema.makeFilterExpr.cmp({ val: ["id", "=", id] })),
  });

  const matches = yield* pipe(
    rules,
    Record.map((rule) => {
      // Match this rule's targets only among the requested records.
      return records
        .listIds([...rule.rule_targets, recordIdsFilter])
        .pipe(Effect.map((ids) => ({ rule, ids: new Set(ids) })));
    }),
    Effect.all,
  );

  // Index rule states by record for the existing prop resolver.
  return Record.fromEntries(
    Array.map(recordIds, (recordId) => {
      return [
        recordId,
        Record.map(matches, (match): RuleMatches.Rule => ({
          ...match.rule,
          // Keep unmatched owners so saved groups aren't treated as unavailable.
          // The resolver omits unmatched groups without saved assignments.
          status: match.ids.has(recordId)
            ? RuleMatches.MatchStatus.Matching()
            : RuleMatches.MatchStatus.Unmatched(),
        })),
      ] as const;
    }),
  );
});

export const readGroups = Effect.fn("ExecuteProps.readGroups")(function* (opts: {
  readonly rows: RecordRepo.ListRecord["props"];
  readonly defs: Attrs.Defs;
  readonly rules: Readonly<Record<RecordSchema.Id, RuleMatches.Rule>>;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
}) {
  const saved = yield* readSaved({ rows: opts.rows, defs: opts.defs });

  // Combine saved values with the props expected by matching rules.
  const groups = RuleProps.reconcileGroups({
    saved,
    defs: opts.defs,
    expectations: RuleProps.collectExpectations(opts.rules),
  });

  return toGroups({
    groups: {
      top: groups.top,
      // The UI hides rule groups that have no prop rows.
      groups: Record.filter(groups.groups, (group) => !Record.isEmptyReadonlyRecord(group.props)),
    },
    labels: opts.labels,
  });
});

export function toValue(opts: {
  readonly state: Attrs.ValueState<AttrsSchema.PropVal>;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
}): Value {
  if (Attrs.ValueState.$is("Unset")(opts.state)) return { state: opts.state, label: null };

  return {
    state: opts.state,
    label: Match.value(opts.state.value).pipe(
      Match.when(undefined, () => null),
      Match.tag("enum", "link", (value) => {
        return opts.labels.get(value.val) ?? "Unavailable record";
      }),
      Match.orElse(RecordFormat.propValueLabel),
    ),
  };
}

export function toEntry(opts: {
  readonly prop: RuleProps.Prop;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
}): Entry {
  return {
    propId: opts.prop.propId,
    label: Option.match(opts.prop.def, {
      onNone: () => opts.labels.get(opts.prop.propId) ?? "Unavailable record",
      onSome: (def) => def.title || "Untitled",
    }),
    def: Option.getOrNull(opts.prop.def),
    expectation: Option.getOrNull(opts.prop.expectation),
    value: toValue({ state: opts.prop.value, labels: opts.labels }),
  };
}

export function toGroups(opts: {
  readonly groups: RuleProps.EditorGroups;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
}): Groups {
  return {
    top: Record.collect(opts.groups.top.props, (_, prop) => toEntry({ prop, labels: opts.labels })),
    groups: Record.collect(opts.groups.groups, (_, group) => ({
      ruleId: group.ruleId,
      label: Match.value(group.status).pipe(
        // The UI shows the record's label even when its rule is unavailable.
        Match.tag("Unavailable", () => opts.labels.get(group.ruleId) ?? "Unavailable record"),
        Match.orElse(RecordFormat.ruleLabel),
      ),
      status: group.status._tag,
      props: Record.collect(group.props, (_, prop) => toEntry({ prop, labels: opts.labels })),
    })),
  };
}

export * as ExecuteProps from "./execute-props";
