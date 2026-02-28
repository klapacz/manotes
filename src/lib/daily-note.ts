import { Temporal } from "temporal-polyfill";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function parseDailyNoteId(noteId: string): Temporal.PlainDate | null {
  try {
    return Temporal.PlainDate.from(noteId, { overflow: "reject" });
  } catch {
    return null;
  }
}

export function formatDailyNoteTitle(noteId: string): string {
  const date = parseDailyNoteId(noteId);
  if (!date) return noteId;

  // Construct in local time to avoid UTC day-shift around timezone boundaries.
  return DISPLAY_FORMAT.format(new Date(date.year, date.month - 1, date.day));
}
