import { Array as Arr, Equal, Option, Predicate, Record, pipe } from "effect";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";

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
  | readonly [variant: "recordings"]
  | readonly [variant: "note", id: string]
  | readonly [
      variant: "stream",
      type: typeof PaneSchema.StreamFilterType.Encoded,
      scope: string | null,
      matches: string | null,
      backlinksTo: string | null,
      linksFrom: string | null,
      date: string | null,
      search: string | null,
      sort: PaneSchema.StreamSort,
      props: readonly (readonly [string, typeof AttrsSchema.PropVal.Encoded])[],
    ];

function normalizeToInput(value: PaneSchema.PaneInput | PaneSchema.Pane): ComparablePane {
  if (Predicate.isTagged(value, "recordings")) return ["recordings"];

  if (Predicate.isTagged(value, "note")) return ["note", value.id];

  return [
    "stream",
    value.filter.type ?? PaneSchema.StreamFilterType.cases.notes.make({}),
    value.scope?.propId ?? null,
    value.matches?.ruleId ?? null,
    value.filter.backlinksTo ?? null,
    value.filter.linksFrom ?? null,
    value.filter.date ?? null,
    value.filter.search?.trim() || null,
    value.sort ?? "date",
    Record.toEntries(value.filter.props ?? StreamSettings.propFilters({})).toSorted(([a], [b]) =>
      a.localeCompare(b),
    ),
  ];
}

const throughCurrent = (cursor: Cursor): InputStack =>
  Arr.splitAtNonEmpty(cursor.stack, cursor.index + 1)[0];

export * as PaneCursor from "./pane.cursor";
