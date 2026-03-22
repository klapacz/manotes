import * as chrono from "chrono-node";
import { createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import * as TemporalUtils from "./temporal/utils";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * Shared signal for requesting a scroll-to + focus of the currently selected
 * daily note.  Each call creates a new object reference so Solid always
 * detects the change.
 */
const [scrollToDateRequest, setScrollToDateRequest] = createSignal<Record<
  string,
  never
> | null>(null);

export { scrollToDateRequest };

export function requestScrollToDate(): void {
  setScrollToDateRequest({});
}

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

export type DailyNoteSuggestion = {
  id: string;
  title: string;
};

export function suggestDailyNoteIds(
  query: string,
  referenceDate: Temporal.PlainDate = Temporal.Now.plainDateISO(),
): DailyNoteSuggestion[] {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return [];

  const exact = parseDailyNoteId(normalizedQuery);
  if (exact) {
    return [
      { id: exact.toString(), title: formatDailyNoteTitle(exact.toString()) },
    ];
  }

  const reference = TemporalUtils.plainDateToJSDate(referenceDate);
  const parsed = chrono.parseDate(normalizedQuery, reference, {
    forwardDate: false,
  });
  if (!parsed) return [];

  const id = TemporalUtils.JSDateToPlainDate(parsed).toString();
  const title = formatDailyNoteTitle(id);
  return [{ id, title }];
}
