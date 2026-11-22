import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PaneCursor } from "./pane.cursor";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Filters } from "@manotes/shared/record/filters";

const decodePane = Schema.decodeUnknownSync(PaneSchema.Pane);

const id = RecordSchema.Id.make("record-a");

describe("PaneCursor.inputMatches", () => {
  it("matches records by ID and ignores pane identity", () => {
    const input = PaneSchema.make.record({ id });
    expect(PaneCursor.inputMatches(input)(decodePane(input))).toBe(true);
    expect(
      PaneCursor.inputMatches(PaneSchema.make.record({ id: RecordSchema.Id.make("other") }))(
        decodePane(input),
      ),
    ).toBe(false);
  });

  it("fills omitted defaults and distinguishes non-empty filters", () => {
    const pane = decodePane(PaneSchema.make.stream({}));
    expect(PaneCursor.inputMatches(PaneSchema.make.stream({}))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneSchema.make.stream({ filter: [] }))(pane)).toBe(true);
    expect(
      PaneCursor.inputMatches(
        PaneSchema.make.stream({ filter: [Filters.aliases.unarchived.make()] }),
      )(pane),
    ).toBe(false);
  });

  it("compares nested expressions and sort while ignoring display view", () => {
    const filter = [
      AttrsSchema.makeFilterExpr.or({
        val: [
          AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "note"] }),
          AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "prop"] }),
        ],
      }),
    ] as const;

    const input = PaneSchema.make.stream({ filter, sort: "date" });
    const pane = decodePane(input);
    expect(PaneCursor.inputMatches({ ...input, view: "snippets" })(pane)).toBe(true);
    expect(PaneCursor.inputMatches({ ...input, sort: "updated" })(pane)).toBe(false);
    expect(
      PaneCursor.inputMatches({
        ...input,
        filter: [...filter, Filters.aliases.unarchived.make()],
      })(pane),
    ).toBe(false);
  });

  it("distinguishes source tags and IDs", () => {
    const input = PaneSchema.make.stream({
      ...StreamSettings.defaultDisplay,
      filter: [],
      source: PaneSchema.Source.cases.prop.make({ id }),
    });

    const pane = decodePane(input);
    expect(PaneCursor.inputMatches(input)(pane)).toBe(true);
    expect(
      PaneCursor.inputMatches({ ...input, source: PaneSchema.Source.cases.rule.make({ id }) })(
        pane,
      ),
    ).toBe(false);
    expect(
      PaneCursor.inputMatches({
        ...input,
        source: PaneSchema.Source.cases.prop.make({ id: RecordSchema.Id.make("other") }),
      })(pane),
    ).toBe(false);
    expect(
      PaneCursor.inputMatches(
        PaneSchema.make.stream({ ...StreamSettings.defaultDisplay, filter: [] }),
      )(pane),
    ).toBe(false);
  });

  it("leaves identity generation to decoding", () => {
    const input = PaneSchema.make.stream({ ...StreamSettings.defaultDisplay, filter: [] });
    expect(input).not.toHaveProperty("paneId");
    expect(decodePane(input).paneId.length).toBeGreaterThan(0);
  });

  it("clears panes when closing the root pane so the route re-resolves the default preset", () => {
    const first = decodePane(PaneSchema.make.record({ id }));
    const second = decodePane(PaneSchema.make.stream({}));
    expect(PaneCursor.close({ stack: [first], index: 0 })).toBeUndefined();
    expect(PaneCursor.close({ stack: [first, second], index: 1 })).toEqual([first]);
  });
});
