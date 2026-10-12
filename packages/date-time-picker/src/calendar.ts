import { createMemo, createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { firstWeekday } from "./locale";

export interface CalendarOptions {
  value?: Temporal.PlainDate | null;
  defaultValue?: Temporal.PlainDate | null;
  onChange?: (value: Temporal.PlainDate) => void;
  placeholderValue?: Temporal.PlainDate;
  minValue?: Temporal.PlainDate;
  maxValue?: Temporal.PlainDate;
  isDateUnavailable?: (date: Temporal.PlainDate) => boolean;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  locale?: string;
  /** ISO weekday, Monday = 1 and Sunday = 7. Defaults to the locale's first day. */
  firstDayOfWeek?: number;
}

export function createCalendarState(props: CalendarOptions) {
  let initial =
    props.value ?? props.defaultValue ?? props.placeholderValue ?? Temporal.Now.plainDateISO();

  if (props.minValue && Temporal.PlainDate.compare(initial, props.minValue) < 0) {
    initial = props.minValue.withCalendar(initial.calendarId);
  }

  if (props.maxValue && Temporal.PlainDate.compare(initial, props.maxValue) > 0) {
    initial = props.maxValue.withCalendar(initial.calendarId);
  }

  const [internalValue, setInternalValue] = createSignal<Temporal.PlainDate | null>(
    props.defaultValue ?? null,
  );

  const value = () => (props.value !== undefined ? props.value : internalValue());
  const [focusedDate, setFocusedDate] = createSignal(initial);

  const visibleMonth = createMemo(() => focusedDate().with({ day: 1 }), undefined, {
    equals: (left, right) => left.equals(right),
  });

  const firstDay = () => {
    const day = props.firstDayOfWeek ?? firstWeekday(props.locale ?? "en-US");

    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new RangeError("firstDayOfWeek must be between 1 and 7.");
    }

    return day;
  };

  const weeks = createMemo(() => {
    const month = visibleMonth();
    const start = month.subtract({ days: (month.dayOfWeek - firstDay() + 7) % 7 });

    return Array.from({ length: 6 }, (_, week) => {
      return Array.from({ length: 7 }, (_, day) => start.add({ days: week * 7 + day }));
    });
  });

  const isUnavailable = (date: Temporal.PlainDate) => {
    return (
      !!props.isDisabled ||
      (!!props.minValue && Temporal.PlainDate.compare(date, props.minValue) < 0) ||
      (!!props.maxValue && Temporal.PlainDate.compare(date, props.maxValue) > 0) ||
      !!props.isDateUnavailable?.(date)
    );
  };

  const isOutsideMonth = (date: Temporal.PlainDate) => {
    return date.monthCode !== visibleMonth().monthCode || date.year !== visibleMonth().year;
  };

  function focusDate(date: Temporal.PlainDate) {
    if (props.isDisabled) return;
    date = date.withCalendar(focusedDate().calendarId);

    if (props.minValue && Temporal.PlainDate.compare(date, props.minValue) < 0) {
      date = props.minValue.withCalendar(date.calendarId);
    }

    if (props.maxValue && Temporal.PlainDate.compare(date, props.maxValue) > 0) {
      date = props.maxValue.withCalendar(date.calendarId);
    }

    if (!focusedDate().equals(date)) setFocusedDate(date);
  }

  function selectDate(date: Temporal.PlainDate) {
    if (props.isReadOnly || isUnavailable(date)) return;

    if (props.value === undefined) setInternalValue(date);
    focusDate(date);

    props.onChange?.(date);
  }

  return {
    value,
    focusedDate,
    visibleMonth,
    weeks,
    firstDayOfWeek: firstDay,
    isUnavailable,
    isOutsideMonth,
    focusDate,
    selectDate,
    previousMonth: () => focusDate(focusedDate().subtract({ months: 1 })),
    nextMonth: () => focusDate(focusedDate().add({ months: 1 })),
    moveFocus: (key: string, shift = false, rtl = false) => {
      const current = focusedDate();

      switch (key) {
        case "ArrowLeft":
          focusDate(current.add({ days: rtl ? 1 : -1 }));
          break;
        case "ArrowRight":
          focusDate(current.add({ days: rtl ? -1 : 1 }));
          break;
        case "ArrowUp":
          focusDate(current.subtract({ days: 7 }));
          break;
        case "ArrowDown":
          focusDate(current.add({ days: 7 }));
          break;
        case "Home":
          focusDate(current.subtract({ days: (current.dayOfWeek - firstDay() + 7) % 7 }));
          break;
        case "End":
          focusDate(current.add({ days: 6 - ((current.dayOfWeek - firstDay() + 7) % 7) }));
          break;
        case "PageUp":
          focusDate(current.subtract(shift ? { years: 1 } : { months: 1 }));
          break;
        case "PageDown":
          focusDate(current.add(shift ? { years: 1 } : { months: 1 }));
          break;
        default:
          return false;
      }

      return true;
    },
  };
}

export type CalendarState = ReturnType<typeof createCalendarState>;
