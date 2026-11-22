import { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Data, Match, Schema } from "effect";
import { PaneCursor } from "./pane.cursor";

export type Choice = Data.TaggedEnum<{
  preset: {
    readonly value: string;
    readonly label: string;
    readonly filter: AttrsSchema.Filter;
  };
  system: {
    readonly value: string;
    readonly label: string;
    readonly settings: StreamSettings.Settings;
  };
}>;

export const Choice = Data.taggedEnum<Choice>();

export const systemStreams = [
  Choice.system({
    value: "system:properties",
    label: "Properties",
    settings: StreamSettings.systemStreams.properties,
  }),
  Choice.system({
    value: "system:rules",
    label: "Rules",
    settings: StreamSettings.systemStreams.rules,
  }),
  Choice.system({
    value: "system:presets",
    label: "Presets",
    settings: StreamSettings.systemStreams.presets,
  }),
] as const;

export function presetChoice(preset: PresetRecordRepo.Def) {
  return Choice.preset({
    value: `preset:${preset.id}`,
    label: preset.title || "Untitled",
    filter: preset.preset_filter,
  });
}

const filterEq = Schema.toEquivalence(AttrsSchema.Filter);

export function matchStream(
  filter: AttrsSchema.Filter,
  presets: readonly PresetRecordRepo.Def[],
): Choice | undefined {
  for (const preset of presets) {
    if (filterEq(filter, preset.preset_filter)) return presetChoice(preset);
  }

  for (const stream of systemStreams) {
    if (filterEq(filter, stream.settings.filter)) return stream;
  }

  return undefined;
}

export function switchStream(
  pane: PaneSchema.PaneStream,
  choice: Choice,
  next: boolean,
): PaneCursor.Transform {
  if (next) {
    const target = Match.value(choice).pipe(
      Match.tags({
        system: ({ settings }) => PaneSchema.make.stream({ ...settings }),
        preset: ({ filter }) => {
          return PaneSchema.make.stream({ ...StreamSettings.defaultDisplay, filter });
        },
      }),
      Match.exhaustive,
    );

    return PaneCursor.openNext(target);
  }

  const updated = Match.value(choice).pipe(
    Match.tags({
      system: ({ settings }) => {
        return PaneSchema.make.stream({
          paneId: pane.paneId,
          filter: settings.filter,
          sort: settings.sort,
          view: pane.view,
        });
      },
      preset: ({ filter }) => {
        return PaneSchema.make.stream({
          paneId: pane.paneId,
          filter,
          sort: pane.sort,
          view: pane.view,
        });
      },
    }),
    Match.exhaustive,
  );

  return PaneCursor.updateCurrent(() => updated);
}

export * as StreamSwitch from "./stream-switch";
