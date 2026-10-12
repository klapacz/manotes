import { createMemo, createSignal, mergeProps, splitProps } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { createCalendarState } from "./calendar";
import type { CalendarOptions } from "./calendar";
import { CalendarView } from "./calendar-view";
import type { CalendarProps } from "./calendar-view";
import type { DateRange } from "./range-state";

export interface RangeCalendarOptions extends Omit<
  CalendarOptions,
  "value" | "defaultValue" | "onChange"
> {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (value: DateRange) => void;
  allowsNonContiguousRanges?: boolean;
}

/**
 * Adapted from React Stately 3.51.0, packages/react-stately/src/calendar/useRangeCalendarState.ts
 * at 821c011ce99032415278d88fba0f51f3fb5e5efe. Ports anchor/highlight/ordered selection to
 * Temporal and Solid, reusing the existing month navigation and grid. Drag selection is omitted.
 */
export function createRangeCalendarState(props: RangeCalendarOptions) {
  const [internalValue, setInternalValue] = createSignal<DateRange | null>(
    props.defaultValue ?? null,
  );

  const value = () => (props.value !== undefined ? props.value : internalValue());
  const [anchorDate, setAnchorDate] = createSignal<Temporal.PlainDate | null>(null);
  const [hoveredDate, setHoveredDate] = createSignal<Temporal.PlainDate | null>(null);

  const [, shared] = splitProps(props, [
    "value",
    "defaultValue",
    "onChange",
    "allowsNonContiguousRanges",
  ]);

  const calendar = createCalendarState(
    mergeProps(shared, {
      get value() {
        return value()?.start ?? null;
      },
      onChange: (date: Temporal.PlainDate) => {
        const anchor = anchorDate();

        if (!anchor) {
          setAnchorDate(date);

          return;
        }

        const range = orderedRange(anchor, date);

        if (props.value === undefined) setInternalValue(range);
        setAnchorDate(null);
        setHoveredDate(null);
        props.onChange?.(range);
      },
    }),
  );

  function constrainEnd(date: Temporal.PlainDate): Temporal.PlainDate {
    const anchor = anchorDate();

    if (!anchor || props.allowsNonContiguousRanges || !props.isDateUnavailable) return date;
    const direction = Temporal.PlainDate.compare(date, anchor) < 0 ? -1 : 1;
    let cursor = anchor;

    while (Temporal.PlainDate.compare(cursor, date) !== 0) {
      const next = cursor.add({ days: direction });

      if (props.isDateUnavailable(next)) return cursor;
      cursor = next;
    }

    return date;
  }

  const isUnavailable = (date: Temporal.PlainDate) => {
    return (
      calendar.isUnavailable(date) || Temporal.PlainDate.compare(constrainEnd(date), date) !== 0
    );
  };

  const highlightedRange = createMemo(() => {
    const anchor = anchorDate();

    return anchor
      ? orderedRange(anchor, constrainEnd(hoveredDate() ?? calendar.focusedDate()))
      : value()
        ? orderedRange(value()!.start, value()!.end)
        : null;
  });

  return {
    value,
    anchorDate,
    highlightedRange,
    cancelSelection: () => {
      setAnchorDate(null);
      setHoveredDate(null);
    },
    highlightDate: (date: Temporal.PlainDate) => {
      if (anchorDate() && !isUnavailable(date)) setHoveredDate(date);
    },
    calendar: {
      ...calendar,
      isUnavailable,
      focusDate: (date: Temporal.PlainDate) => {
        setHoveredDate(null);
        calendar.focusDate(constrainEnd(date));
      },
      selectDate: (date: Temporal.PlainDate) => {
        if (!isUnavailable(date)) calendar.selectDate(date);
      },
      moveFocus: (key: string, shift = false, rtl = false) => {
        setHoveredDate(null);
        const handled = calendar.moveFocus(key, shift, rtl);
        calendar.focusDate(constrainEnd(calendar.focusedDate()));

        return handled;
      },
    },
  };
}

export interface RangeCalendarProps
  extends
    RangeCalendarOptions,
    Pick<CalendarProps, "label" | "class" | "autoFocus" | "previousLabel" | "nextLabel"> {}

export function RangeCalendar(props: RangeCalendarProps) {
  const state = createRangeCalendarState(props);

  const [, shared] = splitProps(props, [
    "value",
    "defaultValue",
    "onChange",
    "allowsNonContiguousRanges",
  ]);

  return (
    <CalendarView
      {...shared}
      state={state.calendar}
      range={state.highlightedRange()}
      onDateHover={state.highlightDate}
    />
  );
}

function orderedRange(start: Temporal.PlainDate, end: Temporal.PlainDate): DateRange {
  return Temporal.PlainDate.compare(start, end) <= 0 ? { start, end } : { start: end, end: start };
}
