// Reused from main 3743aee0, apps/web/src/lib/daily-note.ts.
// Keep its date suggestions for stream filters; omit daily-note navigation and use shared temporal helpers.
import { Stream } from "effect";
import * as chrono from "chrono-node";
import { Temporal } from "temporal-polyfill";
import * as TemporalUtils from "@manotes/shared/temporal/utils";
import { QueryEngine } from "./query-engine";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function parseDate(noteId: string): Temporal.PlainDate | null {
  try {
    return Temporal.PlainDate.from(noteId, { overflow: "reject" });
  } catch {
    return null;
  }
}

export function formatDate(noteId: string): string {
  const date = parseDate(noteId);

  if (!date) return noteId;

  // Construct in local time to avoid UTC day-shift around timezone boundaries.
  return DISPLAY_FORMAT.format(new Date(date.year, date.month - 1, date.day));
}

export type DateSuggestion = {
  id: string;
  title: string;
};

export const relativeDates = ["Tomorrow", "Today", "Yesterday"] as const;

export function defaultSuggestions(): DateSuggestion[] {
  return relativeDates.flatMap((query) => suggestDates(query));
}

export const query: QueryEngine.Query<DateSuggestion> = (request) =>
  Stream.sync(() => {
    const matches = defaultSuggestions().flatMap((value) => {
      const score = QueryEngine.score({ text: request.text, label: value.title });

      return score > 0 ? [{ value, score }] : [];
    });

    if (request.text.trim()) {
      for (const value of suggestDates(request.text)) {
        if (!matches.some((match) => match.value.id === value.id))
          matches.push({ value, score: 1 });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  });

export function suggestDates(
  query: string,
  referenceDate: Temporal.PlainDate = Temporal.Now.plainDateISO(),
): DateSuggestion[] {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) return [];

  const exact = parseDate(normalizedQuery);

  if (exact) {
    return [{ id: exact.toString(), title: formatDate(exact.toString()) }];
  }

  const reference = TemporalUtils.plainDateToJSDate(referenceDate);

  const parsed = chrono.parseDate(normalizedQuery, reference, {
    forwardDate: false,
  });

  if (!parsed) return [];

  const id = TemporalUtils.JSDateToPlainDate(parsed).toString();

  const title =
    relativeDates.find((label) => label.toLowerCase() === normalizedQuery.toLowerCase()) ??
    formatDate(id);

  return [{ id, title }];
}

export * as DateSuggestions from "./date-suggestions";
