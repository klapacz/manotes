import { Array, Equal, Match, Option, pipe } from "effect";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";

export type Stack = Array.NonEmptyReadonlyArray<PaneSchema.Pane>;

export type InputStack = Array.NonEmptyReadonlyArray<PaneSchema.PaneInput>;

export type Cursor = {
  stack: Stack;
  index: number;
};

export type Transform = (cursor: Cursor) => InputStack;

export const pane = (cursor: Cursor): PaneSchema.Pane => {
  return cursor.stack[cursor.index] ?? cursor.stack[0];
};

/** Opens `next` after the current pane, closing panes to the right. */
export const openNext = (next: PaneSchema.PaneInput): Transform => {
  return (cursor) => {
    return Array.append(throughCurrent(cursor), next);
  };
};

export const close: Transform = (cursor) => {
  if (cursor.index === 0) return [PaneSchema.make.stream(StreamSettings.defaultPreset)];

  return Array.splitAtNonEmpty(cursor.stack, cursor.index)[0];
};

export const focus: Transform = (cursor) => {
  const current = pane(cursor);

  return Array.prepend(Array.drop(cursor.stack, cursor.index + 1), current);
};

export const updateCurrent = (
  update: (pane: PaneSchema.Pane) => PaneSchema.PaneInput,
): Transform => {
  return (cursor) => {
    return Option.getOrElse(
      Array.replace(cursor.stack, cursor.index, update(pane(cursor))),
      () => cursor.stack,
    );
  };
};

export const replaceCurrentAndCloseRest = (next: PaneSchema.PaneInput): Transform => {
  return (cursor) => {
    return pipe(
      Array.modify(cursor.stack, cursor.index, () => next),
      Option.getOrElse(() => cursor.stack),
      Array.splitAtNonEmpty(cursor.index + 1),
    )[0];
  };
};

export const replaceAll = (next: PaneSchema.PaneInput): Transform => {
  return () => [next];
};

export const inputMatches = (input: PaneSchema.PaneInput) => {
  return (pane: PaneSchema.Pane): boolean => {
    return Equal.equals(normalizeToInput(input), normalizeToInput(pane));
  };
};

function normalizeToInput(value: PaneSchema.PaneInput | PaneSchema.Pane) {
  return Match.value(value).pipe(
    Match.tag("recordings", () => PaneSchema.make.recordings({})),
    Match.tag("record", ({ id }) => PaneSchema.make.record({ id })),
    Match.tag("stream", (pane) => ({
      ...PaneSchema.make.stream({}),
      filter: pane.filter ?? StreamSettings.defaultPreset.filter,
      source: pane.source ?? null,
      sort: pane.sort ?? StreamSettings.defaultDisplay.sort,
    })),
    Match.exhaustive,
  );
}

const throughCurrent = (cursor: Cursor): InputStack => {
  return Array.splitAtNonEmpty(cursor.stack, cursor.index + 1)[0];
};

export * as PaneCursor from "./pane.cursor";
