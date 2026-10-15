import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PaneCursor } from "./pane.cursor";
import { PaneMake } from "@manotes/shared/record/pane.make";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { AttrsSchema } from "@manotes/shared/attrs.schema";

const decodePane = Schema.decodeUnknownSync(PaneSchema.Pane);

describe("PaneCursor.inputMatches", () => {
  it("matches record inputs by record ID and ignores pane ID", () => {
    const pane = PaneSchema.Pane.cases.record.make({
      paneId: PaneSchema.Id.make("pane-a"),
      id: RecordSchema.Id.make("record-a"),
    });

    expect(PaneCursor.inputMatches(PaneMake.record("record-a"))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneMake.record("record-b"))(pane)).toBe(false);
  });

  it("matches stream inputs with omitted defaults or explicit undefined fields", () => {
    const pane = PaneSchema.Pane.cases.stream.make({
      paneId: PaneSchema.Id.make("pane-a"),
      filter: { type: PaneSchema.StreamFilterType.cases.notes.make({}) },
      sort: "date",
    });

    const explicitUndefined = {
      ...PaneMake.notes(),
      filter: {
        type: PaneSchema.StreamFilterType.cases.notes.make({}),
        backlinksTo: undefined,
        linksFrom: undefined,
        date: undefined,
      },
    } satisfies PaneSchema.PaneInput;

    const omittedDefaults = {
      ...PaneMake.notes(),
      filter: { type: undefined },
      sort: undefined,
    } satisfies PaneSchema.PaneInput;

    expect(PaneCursor.inputMatches(explicitUndefined)(pane)).toBe(true);
    expect(PaneCursor.inputMatches(omittedDefaults)(pane)).toBe(true);
  });

  it("distinguishes stream filters and sort order", () => {
    const pane = PaneSchema.Pane.cases.stream.make({
      paneId: PaneSchema.Id.make("pane-a"),
      filter: { type: PaneSchema.StreamFilterType.cases.notes.make({}), backlinksTo: "record-a" },
      sort: "date",
    });

    const differentSort = PaneSchema.Pane.cases.stream.make({
      paneId: PaneSchema.Id.make("pane-b"),
      filter: { type: PaneSchema.StreamFilterType.cases.notes.make({}), backlinksTo: "record-a" },
      sort: "updated",
    });

    expect(PaneCursor.inputMatches(PaneMake.backlink("record-a"))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneMake.backlink("record-b"))(pane)).toBe(false);
    expect(PaneCursor.inputMatches(PaneMake.backlink("record-a"))(differentSort)).toBe(false);
  });

  it("distinguishes cleared property filters and ignores their insertion order", () => {
    const pane = decodePane(PaneMake.notes());
    expect(
      PaneCursor.inputMatches({
        ...PaneMake.notes(),
        filter: { type: PaneSchema.StreamFilterType.cases.notes.make({}), props: {} },
      })(pane),
    ).toBe(false);

    const filtered = decodePane({
      ...PaneMake.notes(),
      filter: {
        type: PaneSchema.StreamFilterType.cases.notes.make({}),
        props: {
          a: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          b: AttrsSchema.PropVal.cases.bool.make({ val: false }),
        },
      },
    });

    expect(
      PaneCursor.inputMatches({
        ...PaneMake.notes(),
        filter: {
          type: PaneSchema.StreamFilterType.cases.notes.make({}),
          props: {
            b: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            a: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          },
        },
      })(filtered),
    ).toBe(true);
  });
});

describe("PaneMake", () => {
  const inputs: ReadonlyArray<{ readonly name: string; readonly input: PaneSchema.PaneInput }> = [
    { name: "notes", input: PaneMake.notes() },
    { name: "record", input: PaneMake.record("record-a") },
    { name: "backlink", input: PaneMake.backlink("record-a") },
    { name: "outgoing", input: PaneMake.outgoing("record-a") },
    { name: "date", input: PaneMake.date("2026-09-12") },
  ];

  it.each(inputs)("$name leaves pane ID generation to schema decoding", ({ input }) => {
    expect(input).not.toHaveProperty("paneId");

    const pane = decodePane(input);

    expect(pane.paneId.length).toBeGreaterThan(0);
  });
});

it("distinguishes rule match streams from ordinary streams and other rules", () => {
  const filter = { type: PaneSchema.StreamFilterType.cases.notes.make({}) };
  const first = PaneMake.ruleTargets({ ruleId: RecordSchema.Id.make("first-rule"), filter });
  const second = PaneMake.ruleTargets({ ruleId: RecordSchema.Id.make("second-rule"), filter });
  const pane = decodePane(first);

  expect(PaneCursor.inputMatches(first)(pane)).toBe(true);
  expect(PaneCursor.inputMatches(second)(pane)).toBe(false);
  expect(PaneCursor.inputMatches(PaneMake.notes())(pane)).toBe(false);
});
