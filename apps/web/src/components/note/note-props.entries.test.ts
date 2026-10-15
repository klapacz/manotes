import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropDef } from "@manotes/shared/prop-def.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { RuleProps } from "@manotes/shared/rule-props";
import { Option } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { NotePropsEntries } from "./note-props.entries";

// Pure entry transformations never acquire graph-scoped atoms.
vi.mock("../../lib/graph-access/graph-runtime/context", () => ({
  useGraph: () => {
    throw new Error("Unexpected graph access in entry transformations");
  },
}));

const priority = AttrsSchema.NoteId.make("prop_id:priority");

const other = AttrsSchema.NoteId.make("prop_id:other");

const ruleId = AttrsSchema.NoteId.make("rule_id:task");

const recordId = AttrsSchema.NoteId.make("note_id:record");

const required = AttrsSchema.RuleExpectation.cases.required.make({});

const def = PropRecordRepo.Defs.number.make({
  id: priority,
  title: "Priority",
  prop_type: "number",
  prop_default: null,
});

function prop(value: number): RuleProps.Prop {
  return {
    propId: priority,
    def: Option.some(def),
    expectation: Option.some(required),
    value: Attrs.ValueState.Valid({
      value: AttrsSchema.PropVal.cases.number.make({ val: value }),
    }),
  };
}

function groups(): RuleProps.EditorGroups {
  return {
    top: RuleProps.EditorGroup.Top({ props: { [priority]: prop(1) } }),
    groups: {
      [ruleId]: RuleProps.EditorGroup.Rule({
        ruleId,
        status: RuleProps.GroupStatus.Unavailable(),
        props: { [priority]: prop(2) },
      }),
    },
  };
}

describe("note menu prop entries", () => {
  it("offers unused definitions only at the top and preserves saved state", () => {
    const original = groups();

    const enriched = NotePropsEntries.includeUnusedDefs({
      recordId,
      groups: original,
      defs: PropDef.asRecord([
        def,
        { ...def, id: other, title: "Other" },
        { ...def, id: recordId, title: "This record" },
      ]),
    });

    expect(enriched.top.props[priority]).toEqual(original.top.props[priority]);
    expect(enriched.top.props[other]).toMatchObject({
      expectation: Option.none(),
      value: Attrs.ValueState.Unset(),
    });
    expect(enriched.top.props[recordId]).toBeUndefined();
    expect(enriched.groups).toBe(original.groups);
    expect(original.top.props[other]).toBeUndefined();
  });

  it("distinguishes the same prop at the top and within a rule", () => {
    const current = groups();

    const top = Option.getOrThrow(
      NotePropsEntries.find({
        groups: current,
        selection: NotePropsEntries.Selection.Top({ propId: priority }),
      }),
    );

    const nested = Option.getOrThrow(
      NotePropsEntries.find({
        groups: current,
        selection: NotePropsEntries.Selection.Rule({ ruleId, propId: priority }),
      }),
    );

    expect(top.value).toEqual(prop(1).value);
    expect(nested.value).toEqual(prop(2).value);
    expect(NotePropsEntries.selection(top)).toEqual(
      NotePropsEntries.Selection.Top({ propId: priority }),
    );
    expect(NotePropsEntries.selection(nested)).toEqual(
      NotePropsEntries.Selection.Rule({ ruleId, propId: priority }),
    );
    expect(NotePropsEntries.entries(nested.group)[0]).toEqual(nested);
  });

  it("returns None for vanished entries and unavailable groups without discarding saved props", () => {
    const current = groups();

    expect(
      NotePropsEntries.find({
        groups: current,
        selection: NotePropsEntries.Selection.Rule({ ruleId: other, propId: priority }),
      }),
    ).toEqual(Option.none());
    expect(
      NotePropsEntries.find({
        groups: current,
        selection: NotePropsEntries.Selection.Rule({ ruleId, propId: other }),
      }),
    ).toEqual(Option.none());
    expect(
      Option.isSome(
        NotePropsEntries.find({
          groups: current,
          selection: NotePropsEntries.Selection.Rule({ ruleId, propId: priority }),
        }),
      ),
    ).toBe(true);
  });

  it("keeps required and unexpected independent of value validation", () => {
    const missing = { ...prop(1), value: Attrs.ValueState.Unset() };
    const invalid = { ...prop(1), value: Attrs.ValueState.Invalid<never, AttrsSchema.PropVal>({}) };

    expect(RuleProps.isRequired(missing)).toBe(true);
    expect(RuleProps.isRequired(invalid)).toBe(false);
    expect(RuleProps.isUnexpected(missing)).toBe(false);
    expect(RuleProps.isUnexpected({ ...invalid, expectation: Option.none() })).toBe(true);
  });
});
