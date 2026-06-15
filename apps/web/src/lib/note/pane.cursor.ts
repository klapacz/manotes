import { Array as Arr, Equal, Option, pipe, Struct } from "effect";
import { PaneMake } from "./pane.make";
import type { PaneSchema } from "./pane.schema";
import { LibRecord } from "../record";

export type Stack = Arr.NonEmptyReadonlyArray<PaneSchema.Pane>;
export type InputStack = Arr.NonEmptyReadonlyArray<PaneSchema.PaneInput>;

export type Cursor = {
  stack: Stack;
  index: number;
};

export type Transform = (cursor: Cursor) => InputStack;

export const pane = (cursor: Cursor): PaneSchema.Pane =>
  cursor.stack[cursor.index] ?? cursor.stack[0];

/** Opens `next` after the current pane, closing panes to the right. */
export const openNext =
  (next: PaneSchema.PaneInput): Transform =>
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
  (update: (pane: PaneSchema.Pane) => PaneSchema.PaneInput): Transform =>
  (cursor) =>
    Option.getOrElse(
      Arr.replace(cursor.stack, cursor.index, update(pane(cursor))),
      () => cursor.stack,
    );

export const replaceCurrentAndCloseRest =
  (next: PaneSchema.PaneInput): Transform =>
  (cursor) =>
    pipe(
      Arr.modify(cursor.stack, cursor.index, () => next),
      Option.getOrElse(() => cursor.stack),
      Arr.splitAtNonEmpty(cursor.index + 1),
    )[0];

export const inputMatches =
  (input: PaneSchema.PaneInput) =>
  (pane: PaneSchema.Pane): boolean =>
    Equal.equals(normalizeToInput(input), normalizeToInput(pane));

export const normalizeToInput = (value: PaneSchema.PaneInput | PaneSchema.Pane) =>
  LibRecord.omitUndefinedDeep(Struct.omit(value, ["paneId"]));

const throughCurrent = (cursor: Cursor): InputStack =>
  Arr.splitAtNonEmpty(cursor.stack, cursor.index + 1)[0];

export * as PaneCursor from "./pane.cursor";
