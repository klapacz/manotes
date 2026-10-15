import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "./attrs.schema";
import { RuleExpect } from "./rule-expect";

const priority = AttrsSchema.NoteId.make("prop_id:priority");

const cycle = AttrsSchema.NoteId.make("prop_id:cycle");

const task = AttrsSchema.NoteId.make("rule_id:task");

const important = AttrsSchema.NoteId.make("rule_id:important");

const required = AttrsSchema.RuleExpectation.cases.required.make({});

const optional = AttrsSchema.RuleExpectation.cases.optional.make({});

describe("rule expectation reduction", () => {
  it("returns no expectations for an empty input", () => {
    expect(RuleExpect.reduceExpects([])).toEqual({});
  });

  it("keeps empty reductions independent when a UI store mutates an earlier result", () => {
    const earlier = RuleExpect.reduceExpects([]);

    Object.assign(earlier, { [priority]: required });

    expect(RuleExpect.reduceExpects([])).toEqual({});
  });

  it.each([
    [optional, required],
    [required, optional],
    [required, required],
  ])("required wins independently of rule order: %j, %j", (left, right) => {
    const input = [
      { propId: priority, ruleId: task, expectation: left },
      { propId: priority, ruleId: important, expectation: right },
      { propId: cycle, ruleId: task, expectation: optional },
    ];

    expect(RuleExpect.reduceExpects(input)).toEqual({ [priority]: required, [cycle]: optional });
    expect(input[0]?.expectation).toEqual(left);
  });

  it("keeps optional when no rule requires the prop", () => {
    expect(
      RuleExpect.reduceExpects([
        { propId: priority, ruleId: task, expectation: optional },
        { propId: priority, ruleId: important, expectation: optional },
      ]),
    ).toEqual({ [priority]: optional });
  });
});
