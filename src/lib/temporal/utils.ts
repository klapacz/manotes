import { Temporal } from "temporal-polyfill";

export function createDateRange(
  startDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return Array.from({ length: count }, (_, index) =>
    startDate.add({ days: index }),
  );
}
