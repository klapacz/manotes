import { Option, Record } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { PropRecordRepo } from "./prop-record.repo";
import { RuleMatches } from "./rule-matches";
import { RuleProps } from "./rule-props";
import { RuleRecordRepo } from "./rule-record.repo";

const priority = AttrsSchema.NoteId.make("prop_id:priority");

const cycle = AttrsSchema.NoteId.make("prop_id:cycle");

const required = AttrsSchema.RuleExpectation.cases.required.make({});

const optional = AttrsSchema.RuleExpectation.cases.optional.make({});

const defs: Attrs.Defs = {
  [priority]: PropRecordRepo.Defs.number.make({
    id: priority,
    title: "Priority",
    prop_type: "number",
    prop_default: null,
  }),
};

describe("rule prop reconciliation", () => {
  it("merges top expectations and keeps rule groups separate", () => {
    const topOptional = makeRule({ id: "top_optional", storage: "top", matches: true });
    const topRequired = makeRule({ id: "top_required", storage: "top", matches: true });
    const grouped = makeRule({ id: "grouped", storage: "group", matches: true });

    const expectations = RuleProps.collectExpectations({
      [topOptional.id]: { ...topOptional, expects: { [priority]: optional } },
      [topRequired.id]: { ...topRequired, expects: { [priority]: required } },
      [grouped.id]: { ...grouped, expects: { [priority]: optional } },
    });

    const groups = RuleProps.reconcileGroups({
      expectations,
      saved: {
        top: { [priority]: Attrs.ValueState.Valid({ value: number(1) }) },
        groups: { [grouped.id]: { [priority]: Attrs.ValueState.Valid({ value: number(2) }) } },
      },
      defs,
    });

    expect(expectations.top).toEqual({ [priority]: required });
    expect(Record.keys(groups.groups)).toEqual([grouped.id]);
    expect(groups.top.props[priority]).toMatchObject({
      expectation: Option.some(required),
      value: Attrs.ValueState.Valid({ value: number(1) }),
    });
    expect(groups.groups[grouped.id]?.props[priority]).toMatchObject({
      expectation: Option.some(optional),
      value: Attrs.ValueState.Valid({ value: number(2) }),
    });
  });

  it("keeps saved unmatched and unavailable groups and adds unsaved matching groups", () => {
    const unmatched = makeRule({ id: "unmatched", storage: "group", matches: false });
    const expected = makeRule({ id: "expected", storage: "group", matches: true });
    const absent = makeRule({ id: "absent", storage: "group", matches: false });
    const unavailable = AttrsSchema.NoteId.make("unavailable");

    const groups = RuleProps.reconcileGroups({
      expectations: RuleProps.collectExpectations({
        [unmatched.id]: { ...unmatched, expects: { [priority]: required } },
        [expected.id]: { ...expected, expects: { [priority]: required } },
        [absent.id]: absent,
      }),
      saved: {
        top: {},
        groups: {
          [unmatched.id]: { [priority]: Attrs.ValueState.Valid({ value: number(3) }) },
          [unavailable]: { [priority]: Attrs.ValueState.Valid({ value: number(4) }) },
        },
      },
      defs,
    });

    expect(Record.keys(groups.groups)).toEqual([unmatched.id, unavailable, expected.id]);
    expect(groups.groups[unmatched.id]?.status).toEqual(
      RuleProps.GroupStatus.Unmatched({
        rule: { ...unmatched, expects: { [priority]: required } },
      }),
    );
    expect(groups.groups[unavailable]).toMatchObject({
      status: RuleProps.GroupStatus.Unavailable(),
    });
    expect(groups.groups[unavailable]).not.toHaveProperty("rule");
    expect(groups.groups[expected.id]).toMatchObject({
      status: RuleProps.GroupStatus.Matching({
        rule: { ...expected, expects: { [priority]: required } },
      }),
      props: {
        [priority]: { value: Attrs.ValueState.Unset(), expectation: Option.some(required) },
      },
    });
    expect(groups.groups[unmatched.id]?.props[priority]?.expectation).toEqual(Option.none());
    expect(groups.groups[unmatched.id]?.props[priority]?.value).toEqual(
      Attrs.ValueState.Valid({ value: number(3) }),
    );
  });

  it("combines already-validated values with unexpected props and unset expectations", () => {
    const rule = makeRule({ id: "task", storage: "top", matches: true });
    const wrongType = AttrsSchema.PropVal.cases.text.make({ val: "high" });
    const custom = AttrsSchema.NoteId.make("custom");

    const groups = RuleProps.reconcileGroups({
      expectations: RuleProps.collectExpectations({
        [rule.id]: { ...rule, expects: { [priority]: required, [cycle]: optional } },
      }),
      saved: {
        top: {
          [priority]: Attrs.ValueState.Invalid({ value: wrongType }),
          [custom]: Attrs.ValueState.Invalid({ value: number(9) }),
        },
        groups: {},
      },
      defs,
    });

    expect(groups.top.props[priority]?.value).toEqual(
      Attrs.ValueState.Invalid({ value: wrongType }),
    );
    expect(groups.top.props[custom]?.expectation).toEqual(Option.none());
    expect(groups.top.props[custom]?.value).toEqual(Attrs.ValueState.Invalid({ value: number(9) }));
    expect(groups.top.props[cycle]?.value).toEqual(Attrs.ValueState.Unset());
  });

  it("keeps a saved group unmatched when its rule switches to top storage", () => {
    const rule = makeRule({ id: "task", storage: "top", matches: true });

    const groups = RuleProps.reconcileGroups({
      expectations: RuleProps.collectExpectations({
        [rule.id]: { ...rule, expects: { [priority]: required } },
      }),
      saved: {
        top: {},
        groups: { [rule.id]: { [priority]: Attrs.ValueState.Valid({ value: number(5) }) } },
      },
      defs,
    });

    expect(groups.top.props[priority]?.value).toEqual(Attrs.ValueState.Unset());
    expect(groups.groups[rule.id]?.status).toEqual(
      RuleProps.GroupStatus.Unmatched({ rule: { ...rule, expects: { [priority]: required } } }),
    );
    expect(groups.groups[rule.id]?.props[priority]?.expectation).toEqual(Option.none());
    expect(groups.groups[rule.id]?.props[priority]?.value).toEqual(
      Attrs.ValueState.Valid({ value: number(5) }),
    );
  });
});

function makeRule(opts: {
  id: string;
  storage: "top" | "group";
  matches: boolean;
}): RuleMatches.Rule {
  return {
    ...RuleRecordRepo.Rule.make({
      id: AttrsSchema.NoteId.make(opts.id),
      title: opts.id,
      rule_storage: AttrsSchema.RuleStorage.cases[opts.storage].make({}),
      rule_targets: [],
    }),
    status: opts.matches ? RuleMatches.MatchStatus.Matching() : RuleMatches.MatchStatus.Unmatched(),
    expects: {},
  };
}

function number(val: number) {
  return AttrsSchema.PropVal.cases.number.make({ val });
}
