import { Effect, Schema as S } from "effect";
import { PaneMake } from "./pane.make";
import { PaneSchema } from "./pane.schema";

export const Schema = S.Struct({
  panes: S.NonEmptyArray(PaneSchema.Pane).pipe(
    S.withDecodingDefault(Effect.sync(() => [PaneMake.notes()])),
  ),
});

export * as NoteSearch from "./search";
