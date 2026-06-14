import { Array as Arr, Option, pipe } from "effect";
import { PaneMake } from "./pane.make";
import type { PaneSchema } from "./pane.schema";

export type Stack = Arr.NonEmptyReadonlyArray<PaneSchema.Pane>;

export type Cursor = {
  stack: Stack;
  index: number;
};

export type Transform = (cursor: Cursor) => Stack;

export const pane = (cursor: Cursor): PaneSchema.Pane =>
  cursor.stack[cursor.index] ?? cursor.stack[0];

/** Opens `next` after the current pane, closing panes to the right. */
export const openNext =
  (next: PaneSchema.Pane): Transform =>
  (cursor) =>
    Arr.append(throughCurrent(cursor), next);

export const close: Transform = (cursor) => {
  if (cursor.index === 0) return [PaneMake.notes()];
  return Arr.splitAtNonEmpty(cursor.stack, cursor.index)[0];
};

export const focus: Transform = (cursor) => {
  const current = pane(cursor);
  return Arr.prepend(Arr.drop(cursor.stack, cursor.index + 1), current);
};

export const updateCurrent =
  (update: (pane: PaneSchema.Pane) => PaneSchema.Pane): Transform =>
  (cursor) =>
    Option.getOrElse(
      Arr.replace(cursor.stack, cursor.index, update(pane(cursor))),
      () => cursor.stack,
    );

export const replaceCurrentAndCloseRest =
  (next: PaneSchema.Pane): Transform =>
  (cursor) =>
    pipe(
      Arr.modify(cursor.stack, cursor.index, () => next),
      Option.getOrElse(() => cursor.stack),
      Arr.splitAtNonEmpty(cursor.index + 1),
    )[0];

const throughCurrent = (cursor: Cursor): Stack =>
  Arr.splitAtNonEmpty(cursor.stack, cursor.index + 1)[0];

export * as PaneCursor from "./pane.cursor";
