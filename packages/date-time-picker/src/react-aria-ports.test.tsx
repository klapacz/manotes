/*
 * Copyright 2020-2025 Adobe. All rights reserved.
 * Licensed under the Apache License, Version 2.0. See LICENSES/Apache-2.0.txt.
 * Adapted from react-spectrum 821c011ce99032415278d88fba0f51f3fb5e5efe:
 * packages/@adobe/react-spectrum/test/datepicker/{DateField,TimeField}.test.js,
 * packages/react-aria-components/test/{DatePicker,TimeField}.test.js, and
 * packages/react-aria/test/datepicker/useDatePicker.test.tsx.
 * These regression cases specify keyboard, form and picker behavior.
 * Changes: Solid rendering, Vitest assertions, Temporal values, local component API.
 */
// oxlint-disable typescript/unbound-method -- Testing Library queries are already bound to their containers.
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { DateField, TimeField } from "./field";
import { DatePicker } from "./date-picker";
import { Calendar } from "./calendar-view";

describe("React Aria picker regressions, ported to Solid and Temporal", () => {
  it("supports labeling, descriptions, and empty spinbutton segments", () => {
    const { getByRole, getAllByRole } = render(() => (
      <DateField label="Birth date" description="Enter your birthday" />
    ));

    const group = getByRole("group", { name: "Birth date" });
    expect(group.getAttribute("aria-describedby")).toBeTruthy();
    expect(getAllByRole("spinbutton")).toHaveLength(3);

    for (const segment of getAllByRole("spinbutton")) {
      expect(segment.getAttribute("data-placeholder")).toBe("true");
      expect(segment.getAttribute("aria-label")).toContain("Birth date");
    }
  });

  it("should commit programmatically setValue when field is empty", async () => {
    const user = userEvent.setup();

    const { getByRole, getByText } = render(() => {
      const [value, setValue] = createSignal<Temporal.PlainDate | null>(null);

      return (
        <>
          <DateField label="Date" value={value()} onChange={setValue} />
          <button onClick={() => setValue(new Temporal.PlainDate(2020, 3, 12))}>Set date</button>
        </>
      );
    });

    expect(getByRole("group").textContent).toContain("yyyy");
    await user.click(getByText("Set date"));
    expect(getByRole("spinbutton", { name: "year Date" }).textContent).toBe("2020");
  });

  it("should keep dayPeriod the same when a PM hour is cleared", async () => {
    const user = userEvent.setup();

    const { getAllByRole } = render(() => (
      <TimeField label="Time" defaultValue={Temporal.PlainTime.from("20:24")} />
    ));

    const segments = getAllByRole("spinbutton");
    await user.tab();
    expect(document.activeElement).toBe(segments[0]);
    expect(segments[0]?.textContent).toBe("8");
    expect(segments[2]?.textContent).toBe("PM");
    await user.keyboard("{Backspace}");
    expect(segments[0]?.getAttribute("aria-valuetext")).toBe("Empty");
    expect(segments[2]?.textContent).toBe("PM");
    expect(document.activeElement).toBe(segments[0]);
    await user.keyboard("12");
    expect(segments[0]?.textContent).toBe("12");
    expect(segments[2]?.textContent).toBe("PM");
  });

  it("should keep timeZone from defaultValue when a minute is cleared then set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getAllByRole, getByRole } = render(() => (
      <TimeField
        label="Time"
        defaultValue={Temporal.ZonedDateTime.from("2023-07-01T01:05-07:00[America/Los_Angeles]")}
        onChange={onChange}
      />
    ));

    const segments = getAllByRole("spinbutton");
    await user.tab();
    await user.tab();
    await user.keyboard("{Backspace}");
    expect(segments[1]?.getAttribute("aria-valuetext")).toBe("Empty");
    expect(getByRole("group").textContent).toContain("PDT");
    await user.keyboard("{ArrowUp}");
    const changed: Temporal.ZonedDateTime = onChange.mock.calls.at(-1)?.[0];
    expect(changed.timeZoneId).toBe("America/Los_Angeles");
    expect(changed.minute).toBe(0);
    expect(changed.toPlainDate().toString()).toBe("2023-07-01");
  });

  it("should support cycling through DST fall back with a ZonedDateTime defaultValue", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(() => (
      <TimeField
        label="Time"
        defaultValue={Temporal.ZonedDateTime.from("2021-11-07T01:45-07:00[America/Los_Angeles]")}
        onChange={onChange}
      />
    ));
    await user.tab();

    for (const [key, expected] of [
      ["{ArrowUp}", "2021-11-07T01:45:00-08:00[America/Los_Angeles]"],
      ["{ArrowUp}", "2021-11-07T02:45:00-08:00[America/Los_Angeles]"],
      ["{ArrowDown}", "2021-11-07T01:45:00-08:00[America/Los_Angeles]"],
      ["{ArrowDown}", "2021-11-07T01:45:00-07:00[America/Los_Angeles]"],
      ["{ArrowDown}", "2021-11-07T00:45:00-07:00[America/Los_Angeles]"],
    ]) {
      await user.keyboard(key!);
      const value: Temporal.ZonedDateTime = onChange.mock.calls.at(-1)?.[0];
      expect(value.toString()).toBe(expected);
    }

    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("supports form values and form reset", async () => {
    const user = userEvent.setup();

    const { getByRole } = render(() => (
      <form aria-label="Form">
        <TimeField
          label="Time"
          name="time"
          hourCycle={24}
          defaultValue={new Temporal.PlainTime(8, 30)}
        />
        <button type="reset">Reset</button>
      </form>
    ));

    const form = getByRole("form");
    expect(form instanceof HTMLFormElement).toBe(true);

    if (!(form instanceof HTMLFormElement)) throw new Error("Expected a form");
    expect(new FormData(form).get("time")).toBe("08:30:00");
    await user.tab();
    await user.keyboard("{ArrowUp}");
    expect(new FormData(form).get("time")).toBe("09:30:00");
    await user.click(getByRole("button", { name: "Reset" }));
    expect(new FormData(form).get("time")).toBe("08:30:00");
  });

  it("supports required, minValue, maxValue, and validation errors", () => {
    const { getByRole } = render(() => (
      <TimeField
        label="Time"
        defaultValue={new Temporal.PlainTime(5)}
        minValue={new Temporal.PlainTime(6)}
        maxValue={new Temporal.PlainTime(10)}
        isRequired
      />
    ));

    expect(getByRole("group").getAttribute("aria-invalid")).toBe("true");
    expect(getByRole("alert").textContent).toContain("minimum");
    expect(getByRole("spinbutton", { name: "hour Time" }).getAttribute("aria-required")).toBe(
      "true",
    );
  });

  it("supports disabled and read only fields", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getAllByRole } = render(() => (
      <>
        <TimeField label="Disabled" isDisabled defaultValue={new Temporal.PlainTime(5)} />
        <TimeField
          label="Read only"
          isReadOnly
          defaultValue={new Temporal.PlainTime(6)}
          onChange={onChange}
        />
      </>
    ));

    const segments = getAllByRole("spinbutton");
    expect(segments[0]?.hasAttribute("tabindex")).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(segments[3]);
    await user.keyboard("{ArrowUp}1{Backspace}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports typing and arrow navigation without replacing focused segments", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getAllByRole } = render(() => <DateField label="Date" onChange={onChange} />);
    const segments = getAllByRole("spinbutton");
    await user.tab();
    await user.keyboard("02152024");
    const value: Temporal.PlainDate = onChange.mock.calls.at(-1)?.[0];
    expect(value.toString()).toBe("2024-02-15");
    expect(document.activeElement).toBe(segments[2]);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(segments[1]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(segments[1]);
  });

  it("removes one digit at a time with Backspace, then continues typing", async () => {
    const user = userEvent.setup();

    const { getByRole } = render(() => (
      <DateField label="Date" defaultValue={new Temporal.PlainDate(2024, 10, 12)} />
    ));

    const year = getByRole("spinbutton", { name: "year Date" });
    year.focus();
    await user.keyboard("{Backspace}");
    expect(year.textContent).toBe("202");
    await user.keyboard("5");
    expect(year.textContent).toBe("2025");
  });

  it("closes when selecting the current date without emitting a changed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DatePicker
        label="Date"
        defaultValue={new Temporal.PlainDate(2024, 10, 12)}
        onChange={onChange}
      />
    ));

    const trigger = getByRole("button", { name: "Choose date, Date" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Saturday, October 12, 2024" }));
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps calendar focus when navigating across a month boundary", async () => {
    const user = userEvent.setup();

    const { getByRole } = render(() => (
      <DatePicker label="Date" defaultValue={new Temporal.PlainDate(2024, 10, 31)} />
    ));

    await user.click(getByRole("button", { name: "Choose date, Date" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2024-11-01");
    expect(screen.getByRole("grid").getAttribute("aria-labelledby")).toBeTruthy();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2024-10-31");
  });

  it("renders weekday headings for a non-ISO calendar in another locale", () => {
    const { getByRole, getAllByRole } = render(() => (
      <Calendar
        locale="en-US"
        defaultValue={Temporal.PlainDate.from("2024-10-12").withCalendar("hebrew")}
        minValue={Temporal.PlainDate.from("2024-10-10")}
      />
    ));

    expect(getByRole("grid")).toBeTruthy();
    expect(getAllByRole("columnheader")).toHaveLength(7);
    expect(getAllByRole("columnheader")[0]?.getAttribute("aria-label")).toBe("Sunday");
    expect(getByRole("button", { name: "Previous month" }).hasAttribute("disabled")).toBe(true);
  });

  it("supports localized digit input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <TimeField
        label="Time"
        locale="ar-EG"
        hourCycle={24}
        defaultValue={new Temporal.PlainTime(8, 30)}
        onChange={onChange}
      />
    ));

    const hour = getByRole("spinbutton", { name: "hour Time" });
    hour.focus();
    fireEvent(
      hour,
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "١٤",
      }),
    );
    expect(hour.textContent).toBe("١٤");
    const value: Temporal.PlainTime = onChange.mock.calls.at(-1)?.[0];
    expect(value.hour).toBe(14);
    await user.keyboard("{ArrowLeft}");
  });

  it.each([false, true])(
    "keeps February 29 while typing a leap year, controlled=%s",
    async (controlled) => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      const { getByRole } = render(() => {
        const [value, setValue] = createSignal<Temporal.PlainDate | null>(null);

        return (
          <DateField
            label="Date"
            value={controlled ? value() : undefined}
            onChange={(date) => {
              onChange(date);

              if (controlled) setValue(date);
            }}
          />
        );
      });

      getByRole("spinbutton", { name: "month Date" }).focus();
      await user.keyboard("02292024");
      const date: Temporal.PlainDate = onChange.mock.calls.at(-1)?.[0];
      expect(date.toString()).toBe("2024-02-29");
    },
  );

  it("opens the calendar, selects a date, closes, and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DatePicker
        label="Birth date"
        defaultValue={new Temporal.PlainDate(2024, 10, 12)}
        onChange={onChange}
      />
    ));

    const trigger = getByRole("button", { name: "Choose date, Birth date" });
    await user.click(trigger);
    const grid = screen.getByRole("grid");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2024-10-12");
    await user.click(within(grid).getByRole("button", { name: "Tuesday, October 15, 2024" }));
    const date: Temporal.PlainDate = onChange.mock.calls.at(-1)?.[0];
    expect(date.toString()).toBe("2024-10-15");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("selects a visible adjacent-month day with a pointer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DatePicker
        label="Date"
        defaultValue={new Temporal.PlainDate(2024, 10, 12)}
        onChange={onChange}
      />
    ));

    await user.click(getByRole("button", { name: "Choose date, Date" }));
    await user.click(screen.getByRole("button", { name: "Friday, November 1, 2024" }));
    const value: Temporal.PlainDate = onChange.mock.calls.at(-1)?.[0];
    expect(value.toString()).toBe("2024-11-01");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
  });

  it("preserves time and zone when choosing a calendar date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DatePicker
        label="Meeting"
        defaultValue={Temporal.ZonedDateTime.from("2024-10-12T15:32+02:00[Europe/Warsaw]")}
        onChange={onChange}
      />
    ));

    await user.click(getByRole("button", { name: "Choose date, Meeting" }));
    await user.click(screen.getByRole("button", { name: "Sunday, October 27, 2024" }));
    const date: Temporal.ZonedDateTime = onChange.mock.calls.at(-1)?.[0];
    expect(date.toString()).toBe("2024-10-27T15:32:00+01:00[Europe/Warsaw]");
  });

  it("supports keyboard calendar navigation, unavailable dates and Escape", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { getByRole } = render(() => (
      <DatePicker
        label="Date"
        defaultValue={new Temporal.PlainDate(2024, 10, 12)}
        isDateUnavailable={(date) => date.day === 13}
        onChange={onChange}
      />
    ));

    const trigger = getByRole("button", { name: "Choose date, Date" });
    await user.click(trigger);
    await user.keyboard("{ArrowRight}{Enter}");
    expect(document.activeElement?.getAttribute("data-date")).toBe("2024-10-13");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{ArrowRight}{Enter}");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("grid")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
