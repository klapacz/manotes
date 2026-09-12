import { Array as Arr, Equal, Option, Predicate, pipe } from "effect";
import { PaneMake } from "./pane.make";
import type { PaneSchema } from "./pane.schema";

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

export const replaceAll =
  (next: PaneSchema.PaneInput): Transform =>
  () => [next];

export const inputMatches =
  (input: PaneSchema.PaneInput) =>
  (pane: PaneSchema.Pane): boolean =>
    Equal.equals(normalizeToInput(input), normalizeToInput(pane));

type ComparablePane =
  | readonly [variant: "note", id: string]
  | readonly [
      variant: "stream",
      type: "notes" | "pages",
      backlinksTo: string | null,
      linksFrom: string | null,
      date: string | null,
      sort: PaneSchema.StreamSort,
    ];

function normalizeToInput(value: PaneSchema.PaneInput | PaneSchema.Pane): ComparablePane {
  if (Predicate.isTagged(value, "note")) return ["note", value.id];

  return [
    "stream",
    value.filter.type ?? "notes",
    value.filter.backlinksTo ?? null,
    value.filter.linksFrom ?? null,
    value.filter.date ?? null,
    value.sort ?? "date",
  ];
}

const throughCurrent = (cursor: Cursor): InputStack =>
  Arr.splitAtNonEmpty(cursor.stack, cursor.index + 1)[0];

export * as PaneCursor from "./pane.cursor";
