import { Effect, Schema as S } from "effect";
import { StreamSettings } from "./stream-settings";
import { PaneSchema } from "./pane.schema";

export const Schema = S.Struct({
  panes: S.NonEmptyArray(PaneSchema.Pane).pipe(
    S.withDecodingDefault(
      Effect.sync(() => [PaneSchema.make.stream(StreamSettings.defaultPreset)]),
    ),
  ),
});

export * as RecordSearch from "./search";
