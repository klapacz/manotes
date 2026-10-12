# Temporal date and time pickers

Solid components and state helpers modeled on React Aria's segmented date/time fields. Values are `Temporal.PlainDate`, `Temporal.PlainTime`, `Temporal.PlainDateTime`, or `Temporal.ZonedDateTime` from the monorepo's `temporal-polyfill` 0.3.0. No `@internationalized/date` value adapters are needed.

```tsx
import { createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { DatePicker, TimeField } from "@manotes/date-time-picker";

const [date, setDate] = createSignal<Temporal.PlainDate | null>(null);

<DatePicker label="Note date" value={date()} onChange={setDate} name="date" />;
<TimeField label="Time" defaultValue={new Temporal.PlainTime(8, 30)} hourCycle={24} />;
```

`DateField` provides segmented entry. `DatePicker` adds a calendar popover with focus restoration. `TimeField` edits clock time while retaining the date and time zone of date-time values. `Calendar` selects a `PlainDate`. Components are unstyled, with `class`, `calendarClass`, and `data-*` attributes for styling.

`createDateFieldState`, `createTimeFieldState`, and `createCalendarState` support custom rendering. State values and segment lists are Solid accessors. Pass reactive options through getters. `FieldInput` and `CalendarView` render an existing state.

Use `value` and `onChange` for controlled fields, or `defaultValue` for uncontrolled fields. Empty values are `null`. Supply a `placeholderValue` when an empty field needs a date-time or zoned subtype. The default empty date is a `PlainDate`; the default empty time is a `PlainTime`. Hidden form inputs serialize complete values with `toString()` and clear when a segment is incomplete. Form reset restores `defaultValue`.

`locale` controls segment order, number formatting, hour cycle, and calendar week start. `hourCycle` overrides 12/24-hour display. Date fields default to day granularity for dates and minute granularity for date-times. Time fields default to minute granularity. Hidden seconds, fractional precision, calendars, and time zones survive edits.

Arrow keys cycle individual segments. Page keys use larger steps; Home and End select a segment's limits. Typing advances to the next segment; Backspace removes one digit and moves to the preceding segment when empty. Calendar arrows move by day/week, Page keys by month, Shift+Page keys by year, and Home/End by week boundary. Enter selects; Escape closes the popover. Alt+ArrowDown opens it from the field. The calendar reports each allowed selection, so selecting the current date also closes the picker. Fields emit `onChange` only when their value changes.

`minValue`, `maxValue`, `isDateUnavailable`, `isRequired`, `isInvalid`, and `validate` provide ARIA validation and visible errors. Unavailable dates cannot be selected in the calendar. Time-field bounds compare clock time. Date-time bounds compare complete values. The field label is required; `segmentLabels`, `calendarLabel`, and Calendar's navigation labels allow translated assistive labels.

## Development

From the workspace root:

```sh
scripts/nix-develop -c pnpm --filter @manotes/date-time-picker dev
scripts/nix-develop -c pnpm --filter @manotes/date-time-picker test
scripts/nix-develop -c vp check --fix
```

## Scope and upstream sources

This is a Solid/Temporal implementation, not a drop-in React Aria API. It covers single-value date/time fields and a single-date calendar picker. It does not include range pickers, React Spectrum styling, native submit-blocking validation, or React Aria's full calendar/era editing and mobile screen-reader compatibility. Years are editable from 1 to 9999; eras are displayed but not editable. Calendar support follows `temporal-polyfill` and the host's Intl implementation. Assistive labels and validation messages default to English. Browser checks cover desktop keyboard use; mobile IME and VoiceOver need device testing.

Reference implementations:

- Kobalte `@kobalte/core` 0.13.14, commit `675b4a11f4f074007c98b47a573760a1b60849ff`, `packages/core/src/time-field/{time-field-root,time-field-segment}.tsx`. Used to understand Solid segmented entry, focus navigation, and AM/PM behavior. Implementation here replaces its partial object state with Temporal and adds date/calendar support. Runtime popovers use the monorepo's Kobalte version.
- React Stately 3.51.0, React Spectrum commit `821c011ce99032415278d88fba0f51f3fb5e5efe`, `packages/react-stately/src/datepicker/{useDateFieldState,useTimeFieldState}.ts` and `packages/react-aria/src/datepicker/useDateSegment.ts`. Used for segment limits, page steps, incomplete-value semantics, and keyboard behavior. React hooks and `@internationalized/date` are replaced with Solid signals and Temporal.
- Tests in `src/react-aria-ports.test.tsx` adapt selected upstream regression cases from the exact paths listed in their header. React rendering, Jest matchers, and internationalized date constructors are replaced with Solid testing tools, Vitest, and Temporal. Other tests cover implementation-specific Temporal behavior. This is a selected test port, not the entire upstream suite.

Adapted material retains attribution and the Apache 2.0 license in `LICENSES`. See `NOTICE`.
