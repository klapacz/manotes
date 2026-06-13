import { DateTime } from "effect";
import { Temporal } from "temporal-polyfill";

/** Formats a `DateTime` as a `YYYY-MM-DD` string in the local time zone. */
export function toLocalDateString(dateTime: DateTime.DateTime): string {
  return DateTime.formatIsoDate(DateTime.setZone(dateTime, DateTime.zoneMakeLocal()));
}

export function createDateRange(
  startDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return Array.from({ length: count }, (_, index) => startDate.add({ days: index }));
}

export function plainDateToJSDate(date: Temporal.PlainDate): Date {
  return new Date(date.year, date.month - 1, date.day, 12);
}

export function JSDateToPlainDate(date: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
