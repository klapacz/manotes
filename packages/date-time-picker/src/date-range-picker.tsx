import { Popover } from "@kobalte/core/popover";
import { createEffect, createSignal, on } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { CalendarView } from "./calendar-view";
import { DateRangeFieldInput } from "./date-range-field";
import type { DateRangeFieldProps } from "./date-range-field";
import { createRangeCalendarState } from "./range-calendar";
import { createDateRangeFieldState } from "./range-state";
import { toPlainDate } from "./state";
import type { DateValue } from "./types";

export interface DateRangePickerProps<
  T extends DateValue = Temporal.PlainDate,
> extends DateRangeFieldProps<T> {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  firstDayOfWeek?: number;
  calendarLabel?: string;
  calendarClass?: string;
  allowsNonContiguousRanges?: boolean;
}

export function DateRangePicker<T extends DateValue = Temporal.PlainDate>(
  props: DateRangePickerProps<T>,
) {
  const state = createDateRangeFieldState(props);
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const open = () => props.isOpen ?? internalOpen();
  let content: HTMLDivElement | undefined;

  const calendar = createRangeCalendarState({
    get value() {
      const range = state.value();

      return range ? { start: toPlainDate(range.start), end: toPlainDate(range.end) } : null;
    },
    get placeholderValue() {
      return toPlainDate(state.start.displayValue());
    },
    get minValue() {
      return props.minValue ? toPlainDate(props.minValue) : undefined;
    },
    get maxValue() {
      return props.maxValue ? toPlainDate(props.maxValue) : undefined;
    },
    get isDateUnavailable() {
      return props.isDateUnavailable;
    },
    get isDisabled() {
      return props.isDisabled;
    },
    get isReadOnly() {
      return props.isReadOnly;
    },
    get locale() {
      return props.locale;
    },
    get firstDayOfWeek() {
      return props.firstDayOfWeek;
    },
    get allowsNonContiguousRanges() {
      return props.allowsNonContiguousRanges;
    },
    onChange: (range) => {
      const start = state.start.displayValue();
      const end = state.end.displayValue();
      const first = range.start.withCalendar(start.calendarId);
      const last = range.end.withCalendar(end.calendarId);
      // SAFETY: Temporal.with preserves each endpoint's subtype, calendar, clock time, and zone.
      state.setValue({
        start: start.with({ year: first.year, month: first.month, day: first.day }) as T,
        end: end.with({ year: last.year, month: last.month, day: last.day }) as T,
      });
      setOpen(false);
    },
  });

  createEffect(
    on(open, (isOpen) => {
      calendar.cancelSelection();

      if (isOpen) {
        calendar.calendar.focusDate(toPlainDate(state.start.value() ?? state.start.displayValue()));
      }
    }),
  );

  function setOpen(next: boolean) {
    if (next && (props.isDisabled || props.isReadOnly)) return;

    if (props.isOpen === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  }

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      modal
      preventScroll={false}
      placement="bottom-start"
      gutter={8}
      getAnchorRect={(anchor) => anchor?.closest("[data-range-inputs]")?.getBoundingClientRect()}
    >
      <DateRangeFieldInput
        {...props}
        state={state}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Popover.Trigger
          type="button"
          aria-label={props.calendarLabel ?? `Choose date range, ${props.label}`}
          disabled={props.isDisabled || props.isReadOnly}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Popover.Trigger>
      </DateRangeFieldInput>
      <Popover.Portal>
        <Popover.Content
          ref={(element) => {
            content = element;
          }}
          class={props.calendarClass}
          data-picker-popover=""
          aria-label={props.calendarLabel ?? `Choose date range, ${props.label}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content
              ?.querySelector<HTMLElement>("[data-focused='true']")
              ?.focus({ preventScroll: true });
          }}
        >
          <p role="status">{calendar.anchorDate() ? "Choose end date" : "Choose start date"}</p>
          <CalendarView
            state={calendar.calendar}
            locale={props.locale}
            isDisabled={props.isDisabled}
            isReadOnly={props.isReadOnly}
            minValue={props.minValue ? toPlainDate(props.minValue) : undefined}
            maxValue={props.maxValue ? toPlainDate(props.maxValue) : undefined}
            range={calendar.highlightedRange()}
            onDateHover={calendar.highlightDate}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
