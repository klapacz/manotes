import { Popover } from "@kobalte/core/popover";
import { createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { CalendarView } from "./calendar-view";
import { createCalendarState } from "./calendar";
import { FieldInput } from "./field";
import type { FieldProps } from "./field";
import { createDateFieldState, toPlainDate } from "./state";
import type { DateValue } from "./types";

export interface DatePickerProps<T extends DateValue> extends FieldProps<T> {
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  firstDayOfWeek?: number;
  calendarLabel?: string;
  calendarClass?: string;
}

export function DatePicker<T extends DateValue = Temporal.PlainDate>(props: DatePickerProps<T>) {
  const state = createDateFieldState(props);
  let content: HTMLDivElement | undefined;
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const open = () => props.isOpen ?? internalOpen();

  const setOpen = (next: boolean) => {
    if (next && (props.isDisabled || props.isReadOnly)) return;

    if (props.isOpen === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  };

  const calendar = createCalendarState({
    get value() {
      const value = state.value();

      return value ? toPlainDate(value) : null;
    },
    get placeholderValue() {
      return toPlainDate(state.displayValue());
    },
    get minValue() {
      return props.minValue ? toPlainDate(props.minValue) : undefined;
    },
    get maxValue() {
      return props.maxValue ? toPlainDate(props.maxValue) : undefined;
    },
    get isDisabled() {
      return props.isDisabled;
    },
    get isReadOnly() {
      return props.isReadOnly;
    },
    get isDateUnavailable() {
      return props.isDateUnavailable;
    },
    get locale() {
      return props.locale;
    },
    get firstDayOfWeek() {
      return props.firstDayOfWeek;
    },
    onChange: (date) => {
      const current = state.displayValue();
      date = date.withCalendar(current.calendarId);
      // SAFETY: Temporal.with preserves T, including time, calendar, and time zone.
      state.setValue(current.with({ year: date.year, month: date.month, day: date.day }) as T);
      setOpen(false);
    },
  });

  return (
    <Popover
      open={open()}
      onOpenChange={(next) => {
        if (next) calendar.focusDate(toPlainDate(state.value() ?? state.displayValue()));
        setOpen(next);
      }}
      modal
      preventScroll={false}
      placement="bottom-start"
      gutter={8}
      getAnchorRect={(anchor) => anchor?.closest("[data-date-input]")?.getBoundingClientRect()}
    >
      <FieldInput
        {...props}
        state={state}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            calendar.focusDate(toPlainDate(state.value() ?? state.displayValue()));
            setOpen(true);
          }
        }}
      >
        <Popover.Trigger
          type="button"
          aria-label={props.calendarLabel ?? `Choose date, ${props.label}`}
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
      </FieldInput>
      <Popover.Portal>
        <Popover.Content
          ref={(element) => {
            content = element;
          }}
          class={props.calendarClass}
          data-picker-popover=""
          aria-label={props.calendarLabel ?? `Choose date, ${props.label}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            content
              ?.querySelector<HTMLElement>("[data-focused='true']")
              ?.focus({ preventScroll: true });
          }}
        >
          <CalendarView
            state={calendar}
            locale={props.locale}
            isDisabled={props.isDisabled}
            isReadOnly={props.isReadOnly}
            minValue={props.minValue ? toPlainDate(props.minValue) : undefined}
            maxValue={props.maxValue ? toPlainDate(props.maxValue) : undefined}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
