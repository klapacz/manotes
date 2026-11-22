import { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { Filters } from "@manotes/shared/record/filters";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { StreamSwitch } from "./stream-switch";

const decodePane = Schema.decodeUnknownSync(PaneSchema.Pane);

const decodeStreamPane = Schema.decodeUnknownSync(PaneSchema.Pane.cases.stream);

const cmp = AttrsSchema.makeFilterExpr.cmp;

const notesFilter: AttrsSchema.Filter = [
  cmp({ val: ["_tag", "=", "note"] }),
  Filters.aliases.unarchived.make(),
];

const notesPreset: PresetRecordRepo.Def = {
  id: RecordSchema.Id.make("preset-notes"),
  title: "Notes",
  preset_filter: notesFilter,
  preset_default: true,
};

const untitledPreset: PresetRecordRepo.Def = {
  id: RecordSchema.Id.make("preset-untitled"),
  title: null,
  preset_filter: [cmp({ val: ["title", "exists", true] })],
  preset_default: false,
};

const presets = [notesPreset, untitledPreset] as const;

describe("StreamSwitch.matchStream", () => {
  it("matches user presets and falls back to Untitled when title is null", () => {
    expect(StreamSwitch.matchStream(notesFilter, presets)).toEqual(
      StreamSwitch.presetChoice(notesPreset),
    );

    expect(StreamSwitch.matchStream(untitledPreset.preset_filter, presets)).toEqual(
      StreamSwitch.Choice.preset({
        value: "preset:preset-untitled",
        label: "Untitled",
        filter: untitledPreset.preset_filter,
      }),
    );
  });

  it("matches system streams", () => {
    expect(
      StreamSwitch.matchStream(StreamSettings.systemStreams.properties.filter, presets),
    ).toEqual(StreamSwitch.systemStreams[0]);

    expect(StreamSwitch.matchStream(StreamSettings.systemStreams.rules.filter, presets)).toEqual(
      StreamSwitch.systemStreams[1],
    );

    expect(StreamSwitch.matchStream(StreamSettings.systemStreams.presets.filter, presets)).toEqual(
      StreamSwitch.systemStreams[2],
    );
  });

  it("returns undefined for unmatched filters", () => {
    expect(StreamSwitch.matchStream([], presets)).toBeUndefined();
    expect(
      StreamSwitch.matchStream(
        [...notesFilter, cmp({ val: ["body", "contains", "abc"] })],
        presets,
      ),
    ).toBeUndefined();
  });
});

describe("StreamSwitch.switchStream", () => {
  const makeStreamPane = (input: Parameters<typeof PaneSchema.make.stream>[0]) => {
    return decodeStreamPane(PaneSchema.make.stream(input));
  };

  it("replaces current pane for a preset, preserving view and sort and clearing source", () => {
    const current = makeStreamPane({
      filter: [],
      sort: "updated",
      view: "snippets",
      source: PaneSchema.Source.cases.preset.make({ id: notesPreset.id }),
    });

    const trailing = decodePane(PaneSchema.make.record({ id: RecordSchema.Id.make("rec-1") }));

    const result = StreamSwitch.switchStream(
      current,
      StreamSwitch.presetChoice(notesPreset),
      false,
    )({ stack: [current, trailing], index: 0 });

    expect(result).toEqual([
      PaneSchema.make.stream({
        paneId: current.paneId,
        filter: notesFilter,
        sort: "updated",
        view: "snippets",
      }),
      trailing,
    ]);
    expect(result?.[0]).not.toHaveProperty("source");
  });

  it("replaces current pane for a system stream, applying system sort, preserving view, and clearing source", () => {
    const current = makeStreamPane({
      filter: notesFilter,
      sort: "date",
      view: "snippets",
      source: PaneSchema.Source.cases.preset.make({ id: notesPreset.id }),
    });

    const result = StreamSwitch.switchStream(
      current,
      StreamSwitch.systemStreams[0],
      false,
    )({ stack: [current], index: 0 });

    expect(result).toEqual([
      PaneSchema.make.stream({
        paneId: current.paneId,
        filter: StreamSettings.systemStreams.properties.filter,
        sort: "updated",
        view: "snippets",
      }),
    ]);
    expect(result?.[0]).not.toHaveProperty("source");
  });

  it("opens a preset in next pane with default display and no source", () => {
    const current = makeStreamPane({
      filter: [],
      sort: "updated",
      view: "snippets",
      source: PaneSchema.Source.cases.preset.make({ id: notesPreset.id }),
    });

    const result = StreamSwitch.switchStream(
      current,
      StreamSwitch.presetChoice(notesPreset),
      true,
    )({ stack: [current], index: 0 });

    expect(result).toEqual([
      current,
      PaneSchema.make.stream({
        ...StreamSettings.defaultDisplay,
        filter: notesFilter,
      }),
    ]);
    expect(result?.[1]).not.toHaveProperty("source");
    expect(result?.[1]).not.toHaveProperty("paneId");
  });

  it("opens a system stream in next pane with system sort and view and no source", () => {
    const current = makeStreamPane({
      filter: notesFilter,
      sort: "date",
      view: "snippets",
    });

    const result = StreamSwitch.switchStream(
      current,
      StreamSwitch.systemStreams[1],
      true,
    )({ stack: [current], index: 0 });

    expect(result).toEqual([
      current,
      PaneSchema.make.stream({ ...StreamSettings.systemStreams.rules }),
    ]);
    expect(result?.[1]).not.toHaveProperty("source");
    expect(result?.[1]).not.toHaveProperty("paneId");
  });
});
