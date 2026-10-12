// oxlint-disable typescript/unbound-method -- Testing Library queries are bound to their containers.
import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { DateRangePicker } from "./date-range-picker";
import { createRangeCalendarState, RangeCalendar } from "./range-calendar";
import type { DateRange } from "./range-state";

describe("range calendar", () => {
  it("orders two selected dates and previews keyboard focus between selections", () => {
    return withRoot(() => {
      const onChange = vi.fn();

      const state = createRangeCalendarState({
        placeholderValue: new Temporal.PlainDate(2024, 10, 12),
        onChange,
      });

      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 18));
      expect(state.value()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      state.calendar.moveFocus("ArrowLeft");
      expect(state.highlightedRange()?.start.day).toBe(17);
      expect(state.highlightedRange()?.end.day).toBe(18);
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 12));
      expect(state.value()?.start.day).toBe(12);
      expect(state.value()?.end.day).toBe(18);
      expect(state.anchorDate()).toBeNull();
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  it("rejects blocked endpoints and ranges crossing an unavailable day", () => {
    return withRoot(() => {
      const onChange = vi.fn();

      const state = createRangeCalendarState({
        placeholderValue: new Temporal.PlainDate(2024, 10, 14),
        isDateUnavailable: (date) => date.day === 16,
        onChange,
      });

      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 14));
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 16));
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 18));
      expect(onChange).not.toHaveBeenCalled();
      state.calendar.moveFocus("ArrowRight");
      state.calendar.moveFocus("ArrowRight");
      expect(state.calendar.focusedDate().day).toBe(15);
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 15));
      expect(state.value()?.end.day).toBe(15);
    });
  });

  it("allows non-contiguous ranges when explicitly enabled", () => {
    return withRoot(() => {
      const state = createRangeCalendarState({
        allowsNonContiguousRanges: true,
        isDateUnavailable: (date) => date.day === 16,
      });

      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 14));
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 18));
      expect(state.value()?.end.day).toBe(18);
    });
  });

  it("renders the inclusive selected range and selects adjacent-month cells", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole, getAllByRole } = render(() => (
      <RangeCalendar
        defaultValue={{
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        }}
        onChange={onChange}
      />
    ));

    expect(
      getAllByRole("gridcell").filter((cell) => cell.getAttribute("aria-selected") === "true"),
    ).toHaveLength(7);
    await user.click(getByRole("button", { name: "Friday, November 1, 2024" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(getByRole("button", { name: "Tuesday, November 5, 2024" }));
    const range: DateRange = onChange.mock.calls.at(-1)?.[0];
    expect(range.start.toString()).toBe("2024-11-01");
    expect(range.end.toString()).toBe("2024-11-05");
  });

  it.each(["isDisabled", "isReadOnly"] as const)("does not select when %s", (flag) => {
    return withRoot(() => {
      const onChange = vi.fn();
      const state = createRangeCalendarState({ [flag]: true, onChange });
      state.calendar.selectDate(new Temporal.PlainDate(2024, 10, 12));
      expect(state.anchorDate()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

describe("DateRangePicker", () => {
  it("cancels an unfinished selection when the parent closes the popover", async () => {
    const user = userEvent.setup();
    const [open, setOpen] = createSignal(true);
    render(() => (
      <DateRangePicker
        label="Trip"
        isOpen={open()}
        onOpenChange={setOpen}
        placeholderValue={new Temporal.PlainDate(2024, 10, 12)}
      />
    ));
    await user.click(screen.getByRole("button", { name: "Tuesday, October 15, 2024" }));
    expect(screen.getByRole("status").textContent).toBe("Choose end date");
    setOpen(false);
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    setOpen(true);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Choose start date"));
  });

  it("stays open after the first date and closes after the second with focus restored", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DateRangePicker
        label="Trip"
        defaultValue={{
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        }}
        onChange={onChange}
      />
    ));

    const trigger = getByRole("button", { name: "Choose date range, Trip" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Tuesday, October 15, 2024" }));
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Choose end date");
    await user.click(screen.getByRole("button", { name: "Sunday, October 20, 2024" }));
    const range: DateRange = onChange.mock.calls.at(-1)?.[0];
    expect(range.start.day).toBe(15);
    expect(range.end.day).toBe(20);
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("supports keyboard selection and cancels an unfinished selection on Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DateRangePicker
        label="Trip"
        defaultValue={{
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        }}
        onChange={onChange}
      />
    ));

    const trigger = getByRole("button", { name: "Choose date range, Trip" });
    await user.click(trigger);
    await user.keyboard("{Enter}{ArrowRight}{Escape}");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    await user.click(trigger);
    expect(screen.getByRole("status").textContent).toBe("Choose start date");
    await user.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");
    const range: DateRange = onChange.mock.calls.at(-1)?.[0];
    expect(range.start.day).toBe(12);
    expect(range.end.day).toBe(14);
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
  });

  it("preserves each endpoint's clock time and zone across date selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DateRangePicker
        label="Booking"
        defaultValue={{
          start: Temporal.ZonedDateTime.from("2024-10-12T09:30+02:00[Europe/Warsaw]"),
          end: Temporal.ZonedDateTime.from("2024-10-18T17:45-04:00[America/New_York]"),
        }}
        onChange={onChange}
      />
    ));

    await user.click(getByRole("button", { name: "Choose date range, Booking" }));
    await user.click(screen.getByRole("button", { name: "Sunday, October 27, 2024" }));
    await user.click(screen.getByRole("button", { name: "Monday, October 28, 2024" }));
    const range: DateRange<Temporal.ZonedDateTime> = onChange.mock.calls.at(-1)?.[0];
    expect(range.start.toString()).toBe("2024-10-27T09:30:00+01:00[Europe/Warsaw]");
    expect(range.end.toString()).toBe("2024-10-28T17:45:00-04:00[America/New_York]");
  });

  it("uses the controlled range and opens with Alt+ArrowDown", async () => {
    const user = userEvent.setup();

    const { getByRole } = render(() => {
      const [value, setValue] = createSignal<DateRange | null>({
        start: new Temporal.PlainDate(2024, 10, 12),
        end: new Temporal.PlainDate(2024, 10, 18),
      });

      return <DateRangePicker label="Trip" value={value()} onChange={setValue} />;
    });

    getByRole("spinbutton", { name: "day Start Trip" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await user.keyboard("{Enter}{ArrowRight}{Enter}");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(getByRole("spinbutton", { name: "day End Trip" }).textContent).toBe("13");
  });
});

function withRoot(run: () => void) {
  createRoot((dispose) => {
    try {
      run();
    } finally {
      dispose();
    }
  });
}
