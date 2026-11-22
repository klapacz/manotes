import { Schema as S } from "effect";
import { PaneSchema } from "./pane.schema";

export const Schema = S.Struct({
  panes: S.optional(S.NonEmptyArray(PaneSchema.Pane)),
});

export * as RecordSearch from "./search";
