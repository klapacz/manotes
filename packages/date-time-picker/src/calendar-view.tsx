import { For, createEffect, createUniqueId, onMount } from "solid-js";
import { Intl, Temporal } from "temporal-polyfill";
import { createCalendarState } from "./calendar";
import type { CalendarOptions, CalendarState } from "./calendar";
import { isRTL } from "./locale";

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

export function CalendarView(props: CalendarProps & { state: CalendarState }) {
  const state = props.state;
  const headingId = `calendar-${createUniqueId()}`;
  let root!: HTMLDivElement;
  let shouldFocus = false;
  const locale = () => props.locale ?? "en-US";

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
          ‹
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
          ›
        </button>
      </header>
      <table
        role="grid"
        aria-labelledby={headingId}
        aria-readonly={props.isReadOnly || undefined}
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
                      aria-selected={state.value()?.equals(date) ?? false}
                      aria-disabled={state.isUnavailable(date) || undefined}
                    >
                      <button
                        type="button"
                        data-date={date.toString()}
                        data-focused={state.focusedDate().equals(date)}
                        data-outside-month={state.isOutsideMonth(date) || undefined}
                        data-selected={state.value()?.equals(date) || undefined}
                        aria-label={new Intl.DateTimeFormat(locale(), {
                          dateStyle: "full",
                          calendar: date.calendarId === "iso8601" ? "gregory" : date.calendarId,
                        }).format(date)}
                        aria-disabled={state.isUnavailable(date) || undefined}
                        tabIndex={state.focusedDate().equals(date) && !props.isDisabled ? 0 : -1}
                        onFocus={() => {
                          shouldFocus = false;
                          state.focusDate(date);
                        }}
                        onClick={() => state.selectDate(date)}
                      >
                        {new globalThis.Intl.NumberFormat(locale()).format(date.day)}
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
