/*
 * Copyright 2020-2025 Adobe. All rights reserved.
 * Licensed under Apache 2.0; see LICENSES/Apache-2.0.txt.
 * Adapted from react-spectrum 821c011ce99032415278d88fba0f51f3fb5e5efe:
 * packages/react-aria-components/test/DateRangePicker.test.js and
 * packages/@adobe/react-spectrum/test/datepicker/DateRangePicker.test.js.
 * Ports endpoint editing, form values/reset, incomplete ranges and validation.
 * Changes: Solid, Vitest, Temporal, and field-only rendering without a range calendar.
 */
// oxlint-disable typescript/unbound-method -- Testing Library queries are bound to their containers.
import { render, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { DateRangeField } from "./date-range-field";
import { createDateRangeFieldState } from "./range-state";
import type { DateRange } from "./range-state";

describe("DateRangeField", () => {
  it("labels both endpoints and shares descriptions", () => {
    const { getByRole, getAllByRole } = render(() => (
      <DateRangeField label="Trip" description="Choose the first and last day" />
    ));

    expect(getByRole("group", { name: "Trip" })).toBeTruthy();
    const start = getByRole("group", { name: "Start Trip" });
    const end = getByRole("group", { name: "End Trip" });
    expect(within(start).getAllByRole("spinbutton")).toHaveLength(3);
    expect(within(end).getAllByRole("spinbutton")).toHaveLength(3);
    expect(start.getAttribute("aria-describedby")).toBe(end.getAttribute("aria-describedby"));
    expect(getAllByRole("spinbutton")).toHaveLength(6);
  });

  it.each([false, true])("commits only complete ranges, controlled=%s", async (controlled) => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => {
      const [value, setValue] = createSignal<DateRange | null>(null);

      return (
        <DateRangeField
          label="Trip"
          value={controlled ? value() : undefined}
          onChange={(range) => {
            onChange(range);

            if (controlled) setValue(range);
          }}
        />
      );
    });

    getByRole("spinbutton", { name: "month Start Trip" }).focus();
    await user.keyboard("10122024");
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(getByRole("spinbutton", { name: "month End Trip" }));
    await user.keyboard("10182024");
    const range: DateRange = onChange.mock.calls.at(-1)?.[0];
    expect(range.start.toString()).toBe("2024-10-12");
    expect(range.end.toString()).toBe("2024-10-18");
    expect(getByRole("spinbutton", { name: "day Start Trip" }).textContent).toBe("12");
  });

  it("moves between endpoints with arrow keys within the shared field", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => <DateRangeField label="Trip" />);
    const startYear = getByRole("spinbutton", { name: "year Start Trip" });
    const endMonth = getByRole("spinbutton", { name: "month End Trip" });
    startYear.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(endMonth);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(startYear);
  });

  it.each([false, true])(
    "retains the other endpoint when clearing and re-entering, controlled=%s",
    async (controlled) => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      const { getByRole } = render(() => {
        const initial = {
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        };

        const [value, setValue] = createSignal<DateRange | null>(initial);

        return (
          <DateRangeField
            label="Trip"
            value={controlled ? value() : undefined}
            defaultValue={initial}
            onChange={(range) => {
              onChange(range);

              if (controlled) setValue(range);
            }}
          />
        );
      });

      const endMonth = getByRole("spinbutton", { name: "month End Trip" });
      endMonth.focus();
      await user.keyboard("{Backspace}{Backspace}");
      expect(onChange.mock.calls.at(-1)?.[0]).toBeNull();
      expect(getByRole("spinbutton", { name: "day Start Trip" }).textContent).toBe("12");
      await user.keyboard("11");
      const range: DateRange = onChange.mock.calls.at(-1)?.[0];
      expect(range.start.toString()).toBe("2024-10-12");
      expect(range.end.toString()).toBe("2024-11-18");
    },
  );

  it("shows one reversed-range error and marks both endpoints invalid", () => {
    const { getByRole } = render(() => (
      <DateRangeField
        label="Trip"
        defaultValue={{
          start: new Temporal.PlainDate(2024, 10, 18),
          end: new Temporal.PlainDate(2024, 10, 12),
        }}
      />
    ));

    expect(getByRole("alert").textContent).toContain("End date");
    expect(getByRole("group", { name: "Start Trip" }).getAttribute("aria-invalid")).toBe("true");
    expect(getByRole("group", { name: "End Trip" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("serializes separate form values and resets both endpoints together", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <form aria-label="Form">
        <DateRangeField
          label="Trip"
          startName="start"
          endName="end"
          defaultValue={{
            start: new Temporal.PlainDate(2023, 1, 10),
            end: new Temporal.PlainDate(2023, 1, 20),
          }}
          onChange={onChange}
        />
        <button type="reset">Reset</button>
      </form>
    ));

    const form = getByRole("form");

    if (!(form instanceof HTMLFormElement)) throw new Error("Expected a form");
    expect(new FormData(form).get("start")).toBe("2023-01-10");
    expect(new FormData(form).get("end")).toBe("2023-01-20");
    getByRole("spinbutton", { name: "day Start Trip" }).focus();
    await user.keyboard("{ArrowUp}");
    getByRole("spinbutton", { name: "day End Trip" }).focus();
    await user.keyboard("{ArrowUp}");
    onChange.mockClear();
    await user.click(getByRole("button", { name: "Reset" }));
    expect(new FormData(form).get("start")).toBe("2023-01-10");
    expect(new FormData(form).get("end")).toBe("2023-01-20");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("supports an external form and custom endpoint labels", () => {
    const { getByRole } = render(() => (
      <>
        <form id="trip-form" aria-label="Trip form" />
        <DateRangeField
          label="Trip"
          startLabel="Departure"
          endLabel="Return"
          startName="start"
          endName="end"
          form="trip-form"
          defaultValue={{
            start: new Temporal.PlainDate(2023, 1, 10),
            end: new Temporal.PlainDate(2023, 1, 20),
          }}
        />
      </>
    ));

    const form = getByRole("form");

    if (!(form instanceof HTMLFormElement)) throw new Error("Expected a form");
    expect(new FormData(form).get("start")).toBe("2023-01-10");
    expect(getByRole("group", { name: "Departure" })).toBeTruthy();
    expect(getByRole("group", { name: "Return" })).toBeTruthy();
  });

  it.each(["isReadOnly", "isDisabled"] as const)("prevents editing when %s", async (flag) => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DateRangeField
        label="Trip"
        {...{ [flag]: true }}
        defaultValue={{
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        }}
        onChange={onChange}
      />
    ));

    getByRole("spinbutton", { name: "day Start Trip" }).focus();
    await user.keyboard("{ArrowUp}{Backspace}1");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("date range state", () => {
  it("keeps explicit controlled null empty even with a default range", () => {
    return withRoot(() => {
      const state = createDateRangeFieldState({
        value: null,
        defaultValue: {
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, 18),
        },
      });

      expect(state.start.value()).toBeNull();
      expect(state.end.value()).toBeNull();
    });
  });

  it("clears a completed draft when a controlled null owner rejects it", () => {
    return withRoot(() => {
      const onChange = vi.fn();
      const state = createDateRangeFieldState({ value: null, onChange });

      for (const endpoint of [state.start, state.end]) {
        endpoint.setSegment("month", 10);
        endpoint.setSegment("day", 12);
        endpoint.setSegment("year", 2024);
      }

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(state.value()).toBeNull();
      expect(state.start.value()).toBeNull();
      expect(state.end.value()).toBeNull();
      expect(
        state.start
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
      expect(
        state.end
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
    });
  });

  it("accepts equal endpoints and validates bounds, unavailable dates, and custom rules", () => {
    return withRoot(() => {
      const state = createDateRangeFieldState({
        isRequired: true,
        minValue: new Temporal.PlainDate(2024, 10, 10),
        maxValue: new Temporal.PlainDate(2024, 10, 20),
        isDateUnavailable: (date) => date.day === 13,
        validate: (range) => (range.end.day === 19 ? "Reserved" : undefined),
      });

      expect(state.isInvalid()).toBe(true);

      for (const day of [9, 13, 19, 21]) {
        state.setValue({
          start: new Temporal.PlainDate(2024, 10, 12),
          end: new Temporal.PlainDate(2024, 10, day),
        });
        expect(state.isInvalid()).toBe(true);
      }

      state.setValue({
        start: new Temporal.PlainDate(2024, 10, 12),
        end: new Temporal.PlainDate(2024, 10, 12),
      });
      expect(state.isInvalid()).toBe(false);
    });
  });

  it("tracks externally replaced and rejected controlled values", () => {
    return withRoot(() => {
      const [value, setValue] = createSignal<DateRange | null>(null);
      const onChange = vi.fn();

      const state = createDateRangeFieldState({
        get value() {
          return value();
        },
        onChange,
      });

      setValue({
        start: new Temporal.PlainDate(2024, 10, 12),
        end: new Temporal.PlainDate(2024, 10, 18),
      });
      expect(state.start.segments().find((segment) => segment.type === "day")?.value).toBe(12);
      state.start.increment("day");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(state.start.value()?.day).toBe(12);
      setValue(null);
      expect(
        state.start
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
      expect(state.end.value()).toBeNull();
    });
  });

  it("clears incomplete segment drafts when reset or set to null", () => {
    return withRoot(() => {
      const state = createDateRangeFieldState({});
      state.start.setSegment("month", 10);
      state.end.setSegment("day", 18);
      state.reset();
      expect(
        state.start
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
      state.start.setSegment("month", 11);
      state.setValue(null);
      expect(
        state.start
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
    });
  });

  it("preserves each endpoint's time zone and precision during editing", () => {
    return withRoot(() => {
      const state = createDateRangeFieldState({
        defaultValue: {
          start: Temporal.ZonedDateTime.from(
            "2024-10-12T15:30:17.123456789-04:00[America/New_York]",
          ),
          end: Temporal.ZonedDateTime.from("2024-10-18T18:45:23.987654321+02:00[Europe/Warsaw]"),
        },
        granularity: "day",
      });

      state.start.increment("day");
      expect(state.value()?.start.toString()).toBe(
        "2024-10-13T15:30:17.123456789-04:00[America/New_York]",
      );
      expect(state.value()?.end.toString()).toBe(
        "2024-10-18T18:45:23.987654321+02:00[Europe/Warsaw]",
      );
    });
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
