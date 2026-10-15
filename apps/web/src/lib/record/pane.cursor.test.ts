import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PaneCursor } from "./pane.cursor";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";

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

  it("fills omitted defaults but preserves explicitly cleared filters", () => {
    const pane = decodePane(PaneSchema.make.stream(StreamSettings.defaultPreset));
    expect(PaneCursor.inputMatches(PaneSchema.make.stream({}))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneSchema.make.stream({ filter: [] }))(pane)).toBe(false);
  });

  it("compares nested expressions and sort while ignoring display view", () => {
    const filter = [
      AttrsSchema.makeFilterExpr.or({
        val: [StreamSettings.conditions.notes, StreamSettings.conditions.pages],
      }),
    ] as const;

    const input = PaneSchema.make.stream({ filter, sort: "date" });
    const pane = decodePane(input);
    expect(PaneCursor.inputMatches({ ...input, view: "snippets" })(pane)).toBe(true);
    expect(PaneCursor.inputMatches({ ...input, sort: "updated" })(pane)).toBe(false);
    expect(
      PaneCursor.inputMatches({
        ...input,
        filter: [...filter, StreamSettings.conditions.unarchived],
      })(pane),
    ).toBe(false);
  });

  it("distinguishes source tags and IDs", () => {
    const input = PaneSchema.make.stream({
      ...StreamSettings.defaultPreset,
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
      PaneCursor.inputMatches(PaneSchema.make.stream(StreamSettings.defaultPreset))(pane),
    ).toBe(false);
  });

  it("leaves identity generation to decoding", () => {
    const input = PaneSchema.make.stream(StreamSettings.defaultPreset);
    expect(input).not.toHaveProperty("paneId");
    expect(decodePane(input).paneId.length).toBeGreaterThan(0);
  });
});
