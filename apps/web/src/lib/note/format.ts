import { DateTime } from "effect";
import { Temporal } from "temporal-polyfill";
import type * as NoteSchema from "../note.schema";

type NotePreview = Pick<typeof NoteSchema.Preview.Type, "title" | "text">;

export function label(note: NotePreview): string {
  const label = note.title ?? note.text;

  return truncateLabel(label.length > 0 ? label : "Untitled note", 56);
}

function truncateLabel(label: string, maxLength: number): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

/** Renders a `YYYY-MM-DD` logical date as a short locale date (e.g. `12/11/2025`). */
export function formatShortDate(dateString: string): string {
  return Temporal.PlainDate.from(dateString).toLocaleString(undefined, shortDateFormatOptions);
}

/** Labels a separator group: "Today", "Yesterday", or a long weekday date. */
export function formatGroupLabel(dateString: string): string {
  const date = Temporal.PlainDate.from(dateString);
  const today = Temporal.Now.plainDateISO();

  if (Temporal.PlainDate.compare(date, today) === 0) return "Today";

  if (Temporal.PlainDate.compare(date, today.subtract({ days: 1 })) === 0) return "Yesterday";

  if (date.year === today.year) return date.toLocaleString(undefined, groupDateFormatOptions);

  return date.toLocaleString(undefined, {
    ...groupDateFormatOptions,
    year: "numeric",
  });
}

export function formatUpdatedAt(dateTime: DateTime.DateTime): string {
  return DateTime.formatLocal(dateTime, updatedAtFormatOptions);
}

const shortDateFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
} satisfies Intl.DateTimeFormatOptions;

const groupDateFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
} satisfies Intl.DateTimeFormatOptions;

const updatedAtFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

export * as NoteFormat from "./format.ts";
