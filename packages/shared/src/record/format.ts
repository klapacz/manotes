import type { RecordRepo } from "../record.repo";
import { DateTime, Match, String } from "effect";
import { AttrsSchema } from "../attrs.schema";
import type { RuleProps } from "../rule-props";
import { Temporal } from "temporal-polyfill";

type RecordPreview = Pick<RecordRepo.Preview, "title" | "text">;

export function label(record: RecordPreview): string {
  const label = record.title ?? record.text;

  return truncateLabel(label.length > 0 ? label : "Untitled record", 56);
}

export function queryLabel(record: RecordPreview, query = ""): string {
  const text = query.trim().toLowerCase();

  if (record.title && (!text || record.title.toLowerCase().includes(text))) return record.title;

  return (
    record.text
      .split("\n")
      .find((line) => line.toLowerCase().includes(text) && line.trim())
      ?.trim() ||
    record.title ||
    "Untitled record"
  );
}

export function propValueLabel(value: AttrsSchema.PropVal): string {
  return Match.value(value).pipe(
    Match.tag("bool", ({ val }) => (val ? "True" : "False")),
    Match.tag("number", ({ val }) => val.toString()),
    Match.tag("text", ({ val }) => {
      if (String.isEmpty(val)) return '""';

      return val;
    }),
    Match.tag("enum", () => "Enum option"),
    // Reference labels are resolved reactively by PropPicker.ValueLabel.
    Match.tag("link", () => "Reference"),
    Match.exhaustive,
  );
}

export function ruleLabel(status: RuleProps.GroupStatus): string {
  return Match.value(status).pipe(
    Match.tag("Unavailable", () => "Rule unavailable"),
    Match.orElse((status) => status.rule.title || "Untitled"),
  );
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
  dateStyle: "short",
  timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

export * as RecordFormat from "./format.ts";
