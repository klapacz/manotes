import { For, createEffect, createUniqueId, onMount, untrack } from "solid-js";
import { Intl, Temporal } from "temporal-polyfill";
import { createCalendarState } from "./calendar";
import type { CalendarOptions, CalendarState } from "./calendar";
import { isRTL } from "./locale";
import type { DateRange } from "./range-state";

export interface CalendarProps extends CalendarOptions {
  label?: string;
  class?: string;
  autoFocus?: boolean;
  previousLabel?: string;
  nextLabel?: string;
}

export function Calendar(props: CalendarProps) {
  const state = createCalendarState(props);

  return <CalendarView {...props} state={state} />;
}

export function CalendarView(
  props: CalendarProps & {
    state: CalendarState;
    range?: DateRange | null;
    onDateHover?: (date: Temporal.PlainDate) => void;
  },
) {
  const state = props.state;
  const headingId = `calendar-${createUniqueId()}`;
  let root!: HTMLDivElement;
  let shouldFocus = false;
  const locale = () => props.locale ?? "en-US";

  const isSelected = (date: Temporal.PlainDate) => {
    return props.range !== undefined
      ? !!props.range &&
          Temporal.PlainDate.compare(date, props.range.start) >= 0 &&
          Temporal.PlainDate.compare(date, props.range.end) <= 0
      : (state.value()?.equals(date) ?? false);
  };

  const monthLabel = () => {
    return state.visibleMonth().toLocaleString(locale(), {
      month: "long",
      year: "numeric",
      calendar:
        state.visibleMonth().calendarId === "iso8601" ? "gregory" : state.visibleMonth().calendarId,
    });
  };

  const focusCell = () => root.querySelector<HTMLElement>("[data-focused='true']")?.focus();
  onMount(() => {
    if (props.autoFocus) focusCell();
  });
  createEffect(() => {
    state.focusedDate();

    if (shouldFocus) queueMicrotask(focusCell);
  });

  function navigate(action: () => void) {
    shouldFocus = true;
    action();
    queueMicrotask(focusCell);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.target === event.currentTarget) return;
    shouldFocus = true;
    const rtl = isRTL(locale());

    if (state.moveFocus(event.key, event.shiftKey, rtl)) event.preventDefault();
  }

  return (
    <div
      ref={(element) => {
        root = element;
      }}
      class={props.class}
      dir={isRTL(locale()) ? "rtl" : "ltr"}
      data-calendar=""
      aria-label={props.label ?? "Calendar"}
    >
      <header>
        <button
          type="button"
          aria-label={props.previousLabel ?? "Previous month"}
          disabled={
            props.isDisabled ||
            (!!props.minValue &&
              Temporal.PlainDate.compare(
                state.visibleMonth(),
                props.minValue.withCalendar(state.visibleMonth().calendarId).with({ day: 1 }),
              ) <= 0)
          }
          onClick={() => navigate(state.previousMonth)}
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
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span id={headingId} aria-live="polite">
          {monthLabel()}
        </span>
        <button
          type="button"
          aria-label={props.nextLabel ?? "Next month"}
          disabled={
            props.isDisabled ||
            (!!props.maxValue &&
              Temporal.PlainDate.compare(
                state.visibleMonth(),
                props.maxValue.withCalendar(state.visibleMonth().calendarId).with({ day: 1 }),
              ) >= 0)
          }
          onClick={() => navigate(state.nextMonth)}
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
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </header>
      <table
        role="grid"
        aria-labelledby={headingId}
        aria-readonly={props.isReadOnly || undefined}
        aria-multiselectable={props.range !== undefined || undefined}
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            <For each={state.weeks()[0]}>
              {(date) => (
                <th
                  scope="col"
                  aria-label={date
                    .withCalendar("iso8601")
                    .toLocaleString(locale(), { weekday: "long" })}
                >
                  {date.withCalendar("iso8601").toLocaleString(locale(), { weekday: "narrow" })}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={state.weeks()}>
            {(week) => (
              <tr>
                <For each={week}>
                  {(date) => (
                    <td
                      role="gridcell"
                      aria-selected={isSelected(date)}
                      aria-disabled={state.isUnavailable(date) || undefined}
                    >
                      <button
                        type="button"
                        data-date={date.toString()}
                        data-focused={state.focusedDate().equals(date)}
                        data-outside-month={state.isOutsideMonth(date) || undefined}
                        data-selected={isSelected(date) || undefined}
                        data-unavailable={props.isDateUnavailable?.(date) || undefined}
                        data-range-start={props.range?.start.equals(date) || undefined}
                        data-range-end={props.range?.end.equals(date) || undefined}
                        aria-label={new Intl.DateTimeFormat(locale(), {
                          dateStyle: "full",
                          calendar: date.calendarId === "iso8601" ? "gregory" : date.calendarId,
                        }).format(date)}
                        aria-disabled={state.isUnavailable(date) || undefined}
                        tabIndex={state.focusedDate().equals(date) && !props.isDisabled ? 0 : -1}
                        onFocus={() => {
                          shouldFocus = false;
                          // A popover may focus this cell inside an effect; don't subscribe that effect to selection.
                          untrack(() => state.focusDate(date));
                        }}
                        onPointerDown={(event) => {
                          if (event.button === 0) event.preventDefault();
                        }}
                        onPointerEnter={() => props.onDateHover?.(date)}
                        onClick={() => navigate(() => state.selectDate(date))}
                      >
                        <span>{new globalThis.Intl.NumberFormat(locale()).format(date.day)}</span>
                      </button>
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
