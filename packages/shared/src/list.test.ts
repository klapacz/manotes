import { RecordSchema } from "./record.schema";
import { describe, expect, it } from "vite-plus/test";
import { CliList } from "./list";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { ExecuteProps } from "./execute-props";
import { PropRecordRepo } from "./prop-record.repo";

const itemFields = {
  props: { top: [], groups: [] },
  id: RecordSchema.Id.make("record-1"),
  title: "Plan",
  text: "Plan First paragraph. Second paragraph.",
  date: "2026-11-08",
  createdAt: "2026-11-08T10:00:00.000Z",
  updatedAt: "2026-11-08T11:00:00.000Z",
  markdown: "# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n",
  snippets: ["First paragraph."],
};

const item = CliList.Item.cases.note.make(itemFields);

const header = "Plan record-1 2026-11-08";

const propId = RecordSchema.Id.make("flag");

const flag = ExecuteProps.Entry.make({
  propId,
  label: "Flag",
  def: PropRecordRepo.Defs.bool.make({
    id: propId,
    title: "Flag",
    prop_type: "bool",
    prop_default: null,
  }),
  expectation: null,
  value: {
    state: Attrs.ValueState.Valid({ value: AttrsSchema.PropVal.cases.bool.make({ val: false }) }),
    label: "False",
  },
});

const settingsFields = { ...itemFields, markdown: "", snippets: [] };

const unset = ExecuteProps.Value.make({ state: Attrs.ValueState.Unset(), label: null });

describe("CliList.format", () => {
  it.each([
    ["oneline", "Plan record-1 2026-11-08"],
    ["short", "Plan record-1 2026-11-08\n\n  First paragraph."],
    [
      "full",
      "Plan record-1 2026-11-08\n\n  # Plan\n  \n  First paragraph.\n  \n  Second paragraph.\n  ",
    ],
  ] as const)("renders %s without filenames or metadata", (format, expected) => {
    expect(CliList.format(format, [item])).toBe(expected);
  });

  it("uses Untitled and handles empty content and multiple records", () => {
    const empty = { ...item, title: null, snippets: [], markdown: "" };
    expect(CliList.format("short", [empty])).toBe("Untitled record-1 2026-11-08");
    expect(CliList.format("full", [empty])).toBe("Untitled record-1 2026-11-08");
    expect(CliList.format("oneline", [item, empty])).toBe(
      "Plan record-1 2026-11-08\nUntitled record-1 2026-11-08",
    );

    for (const format of ["oneline", "short", "full"] as const) {
      expect(CliList.format(format, [])).toBe("");
    }
  });

  it("preserves multiline Markdown snippets without character limits", () => {
    const snippet = "- [ ] " + "long text ".repeat(40) + "\n  continuation";
    expect(CliList.format("short", [{ ...item, snippets: [snippet, "```js\nrun();\n```"] }])).toBe(
      `Plan record-1 2026-11-08\n\n  ${snippet.replaceAll("\n", "\n  ")}\n  \n  \`\`\`js\n  run();\n  \`\`\``,
    );
  });

  it.each(["short", "full"] as const)("renders grouped props and UI warnings in %s", (format) => {
    const record = CliList.Item.cases.note.make({
      ...itemFields,
      markdown: "Body.",
      snippets: ["Body."],
      props: {
        top: [{ ...flag, expectation: AttrsSchema.RuleExpectation.cases.required.make({}) }],
        groups: [
          {
            ruleId: RecordSchema.Id.make("task-rule"),
            label: "Task",
            status: "Matching",
            props: [
              {
                ...flag,
                expectation: AttrsSchema.RuleExpectation.cases.required.make({}),
                value: unset,
              },
            ],
          },
          {
            ruleId: RecordSchema.Id.make("old-rule"),
            label: "Old",
            status: "Unmatched",
            props: [flag],
          },
          {
            ruleId: RecordSchema.Id.make("gone-rule"),
            label: "Gone",
            status: "Unavailable",
            props: [
              {
                ...flag,
                def: null,
                value: {
                  state: Attrs.ValueState.Invalid<never, AttrsSchema.PropVal>({}),
                  label: null,
                },
              },
            ],
          },
        ],
      },
    });

    expect(CliList.format(format, [record])).toBe(
      [
        header,
        "",
        "  Body.",
        "",
        "  Props:",
        "    Flag [flag]: False",
        "    Task [task-rule]:",
        "      Flag [flag]: unset (required)",
        "    Old [old-rule] (no longer applies):",
        "      Flag [flag]: False (unexpected)",
        "    Gone [gone-rule] (rule unavailable):",
        "      Flag [flag]: invalid (unexpected, prop unavailable)",
      ].join("\n"),
    );
    expect(CliList.format("oneline", [record])).toBe(header);
  });

  it("shows props without a body and preserves body trailing newlines", () => {
    const record = CliList.Item.cases.note.make({
      ...settingsFields,
      props: { top: [flag], groups: [] },
    });

    expect(CliList.format("full", [record])).toBe(`${header}\n\n  Props:\n    Flag [flag]: False`);
    expect(CliList.format("full", [{ ...record, markdown: "Body.\n" }])).toBe(
      `${header}\n\n  Body.\n  \n\n  Props:\n    Flag [flag]: False`,
    );
  });

  it.each([
    [
      "False",
      "bool",
      {
        state: Attrs.ValueState.Valid({
          value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
        }),
        label: null,
      },
    ],
    [
      "0",
      "number",
      {
        state: Attrs.ValueState.Valid({ value: AttrsSchema.PropVal.cases.number.make({ val: 0 }) }),
        label: null,
      },
    ],
    [
      '""',
      "text",
      {
        state: Attrs.ValueState.Valid({ value: AttrsSchema.PropVal.cases.text.make({ val: "" }) }),
        label: '""',
      },
    ],
    [
      '"hello\\nworld"',
      "text",
      {
        state: Attrs.ValueState.Valid({
          value: AttrsSchema.PropVal.cases.text.make({ val: "hello\nworld" }),
        }),
        label: "hello\nworld",
      },
    ],
    [
      "Done [done]",
      "enum",
      {
        state: Attrs.ValueState.Valid({
          value: AttrsSchema.PropVal.cases.enum.make({ val: RecordSchema.Id.make("done") }),
        }),
        label: "Done",
      },
    ],
    [
      "Target [target]",
      "link",
      {
        state: Attrs.ValueState.Valid({
          value: AttrsSchema.PropVal.cases.link.make({ val: RecordSchema.Id.make("target") }),
        }),
        label: "Target",
      },
    ],
    [
      "Unavailable record [missing]",
      "link",
      {
        state: Attrs.ValueState.Valid({
          value: AttrsSchema.PropVal.cases.link.make({ val: RecordSchema.Id.make("missing") }),
        }),
        label: null,
      },
    ],
    ["unset", "bool", unset],
    [
      "invalid",
      "bool",
      { state: Attrs.ValueState.Invalid<never, AttrsSchema.PropVal>({}), label: null },
    ],
    [
      'invalid: "wrong type"',
      "bool",
      {
        state: Attrs.ValueState.Invalid({
          value: AttrsSchema.PropVal.cases.text.make({ val: "wrong type" }),
        }),
        label: "wrong type",
      },
    ],
  ] as const)("formats default values as %s", (expected, type, value) => {
    const record = CliList.Item.cases.prop.make({
      ...settingsFields,
      prop_type: type,
      prop_default: value,
      prop_targets: null,
    });

    expect(CliList.format("full", [record])).toContain(`\n    Default: ${expected}`);
  });

  it("shows exact link targets in full and leaves settings out of short and oneline", () => {
    const targets = [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "note"] })];

    const record = CliList.Item.cases.prop.make({
      ...itemFields,
      markdown: "Body.",
      snippets: ["Snippet."],
      prop_type: "link",
      prop_default: unset,
      prop_targets: targets,
      props: { top: [flag], groups: [] },
    });

    expect(CliList.format("full", [record])).toBe(
      [
        header,
        "",
        "  Body.",
        "",
        "  Prop def:",
        "    Type: link",
        "    Default: unset",
        `    Targets: ${JSON.stringify(record.prop_targets)}`,
        "",
        "  Props:",
        "    Flag [flag]: False",
      ].join("\n"),
    );
    expect(CliList.format("short", [record])).toBe(
      `${header}\n\n  Snippet.\n\n  Props:\n    Flag [flag]: False`,
    );
    expect(CliList.format("oneline", [record])).toBe(header);

    for (const prop_targets of [null, []]) {
      expect(CliList.format("full", [{ ...record, prop_targets }])).toContain(
        "Targets: all records",
      );
    }

    expect(CliList.format("full", [{ ...record, prop_type: null }])).toContain("Type: unset");
    expect(CliList.format("full", [{ ...record, prop_type: "bool" }])).not.toContain("Targets:");
  });

  it("shows owned type and parent, including incomplete owned records", () => {
    const record = CliList.Item.cases.owned.make({
      ...settingsFields,
      owned_type: "enum_option",
      owned_parent: propId,
    });

    expect(CliList.format("full", [record])).toBe(
      `${header}\n\n  Owned record:\n    Type: enum_option\n    Parent: [flag]`,
    );
    expect(CliList.format("full", [{ ...record, owned_type: null, owned_parent: null }])).toBe(
      `${header}\n\n  Owned record:\n    Type: unset\n    Parent: unset`,
    );
  });

  it("shows rule storage, targets and required/optional expectations", () => {
    const record = CliList.Item.cases.rule.make({
      ...settingsFields,
      rule_storage: AttrsSchema.RuleStorage.cases.group.make({}),
      rule_targets: [],
      rule_expects: {
        [propId]: AttrsSchema.RuleExpectation.cases.required.make({}),
        [RecordSchema.Id.make("status")]: AttrsSchema.RuleExpectation.cases.optional.make({}),
      },
    });

    expect(CliList.format("full", [record])).toBe(
      [
        header,
        "",
        "  Rule def:",
        "    Storage: group",
        "    Targets: all records",
        "    Expects:",
        "      [flag]: required",
        "      [status]: optional",
      ].join("\n"),
    );
    expect(
      CliList.format("full", [
        {
          ...record,
          rule_storage: null,
          rule_targets: null,
          rule_expects: {},
        },
      ]),
    ).toBe(`${header}\n\n  Rule def:\n    Storage: unset\n    Targets: unset\n    Expects: none`);
    const targets = [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", propId] })];
    expect(CliList.format("full", [{ ...record, rule_targets: targets }])).toContain(
      `Targets: ${JSON.stringify(targets)}`,
    );
  });
});
