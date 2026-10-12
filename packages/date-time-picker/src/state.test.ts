import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { createCalendarState } from "./calendar";
import { createDateFieldState, createTimeFieldState } from "./state";

describe("Temporal field state", () => {
  it("commits only when all visible segments are filled", () => {
    return withRoot(() => {
      const onChange = vi.fn();
      const state = createDateFieldState({ onChange });
      state.setSegment("month", 2);
      state.setSegment("day", 29);
      expect(state.value()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      state.setSegment("year", 2024);
      expect(state.value()?.toString()).toBe("2024-02-29");
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  it("constrains days when editing month and year", () => {
    return withRoot(() => {
      const state = createDateFieldState({ defaultValue: Temporal.PlainDate.from("2024-01-31") });
      state.setSegment("month", 2);
      expect(state.value()?.toString()).toBe("2024-02-29");
      state.setSegment("year", 2023);
      expect(state.value()?.toString()).toBe("2023-02-28");
    });
  });

  it("clears a segment without discarding the remaining draft", () => {
    return withRoot(() => {
      const state = createDateFieldState({ defaultValue: Temporal.PlainDate.from("2024-10-12") });
      state.clearSegment("month");
      expect(state.value()).toBeNull();
      expect(state.segments().find((segment) => segment.type === "year")?.text).toBe("2024");
      state.setSegment("month", 3);
      expect(state.value()?.toString()).toBe("2024-03-12");
    });
  });

  it("uses the placeholder on the first increment and wraps segments", () => {
    return withRoot(() => {
      const state = createTimeFieldState({
        placeholderValue: Temporal.PlainTime.from("23:59"),
        hourCycle: 24,
      });

      state.increment("hour");
      expect(state.segments().find((segment) => segment.type === "hour")?.value).toBe(23);
      state.increment("hour");
      state.increment("minute");
      expect(state.value()?.toString()).toBe("00:59:00");
      state.increment("minute");
      expect(state.value()?.toString()).toBe("00:00:00");
    });
  });

  it("maps noon and midnight to hour 12 and preserves the period", () => {
    return withRoot(() => {
      const state = createTimeFieldState({
        defaultValue: Temporal.PlainTime.from("12:30"),
        hourCycle: 12,
      });

      expect(state.segments().find((segment) => segment.type === "hour")?.value).toBe(12);
      state.setSegment("hour", 12);
      expect(state.value()?.hour).toBe(12);
      state.setSegment("dayPeriod", 0);
      expect(state.value()?.hour).toBe(0);
      state.increment("hour");
      expect(state.value()?.hour).toBe(1);
    });
  });

  it("rounds page steps and handles Home and End limits", () => {
    return withRoot(() => {
      const state = createTimeFieldState({
        defaultValue: Temporal.PlainTime.from("10:07"),
        hourCycle: 24,
      });

      state.incrementPage("minute");
      expect(state.value()?.minute).toBe(15);
      state.incrementPage("minute", -1);
      expect(state.value()?.minute).toBe(0);
      state.setSegmentToLimit("hour", "max");
      expect(state.value()?.hour).toBe(23);
      state.setSegmentToLimit("hour", "min");
      expect(state.value()?.hour).toBe(0);
    });
  });

  it("preserves hidden time and subsecond precision", () => {
    return withRoot(() => {
      const state = createDateFieldState({
        defaultValue: Temporal.PlainDateTime.from("2024-02-29T15:32:17.123456789"),
        granularity: "day",
      });

      state.setSegment("day", 20);
      expect(state.value()?.toString()).toBe("2024-02-20T15:32:17.123456789");
    });
  });

  it("tracks external controlled values and sends edits to the owner", () => {
    return withRoot(() => {
      const [value, setValue] = createSignal<Temporal.PlainDate | null>(null);

      const state = createDateFieldState({
        get value() {
          return value();
        },
        onChange: setValue,
      });

      setValue(Temporal.PlainDate.from("2020-03-12"));
      expect(state.segments().find((segment) => segment.type === "year")?.text).toBe("2020");
      state.increment("day");
      expect(value()?.toString()).toBe("2020-03-13");
      setValue(null);
      expect(
        state
          .segments()
          .filter((segment) => segment.isEditable)
          .every((segment) => segment.isPlaceholder),
      ).toBe(true);
    });
  });

  it.each(["isDisabled", "isReadOnly"] as const)("does not mutate when %s", (flag) => {
    return withRoot(() => {
      const onChange = vi.fn();

      const state = createTimeFieldState({
        defaultValue: new Temporal.PlainTime(8, 30),
        [flag]: true,
        onChange,
      });

      state.increment("hour");
      state.clearSegment("minute");
      state.setValue(new Temporal.PlainTime(9));
      expect(state.value()?.toString()).toBe("08:30:00");
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("validates required, bounds, unavailable dates and custom rules", () => {
    return withRoot(() => {
      const state = createDateFieldState({
        isRequired: true,
        minValue: Temporal.PlainDate.from("2024-01-10"),
        maxValue: Temporal.PlainDate.from("2024-01-20"),
        isDateUnavailable: (date) => date.day === 15,
        validate: (date) => (date.day === 16 ? "Reserved" : undefined),
      });

      expect(state.isInvalid()).toBe(true);

      for (const day of [9, 15, 16, 21]) {
        state.setValue(new Temporal.PlainDate(2024, 1, day));
        expect(state.isInvalid()).toBe(true);
      }

      state.setValue(new Temporal.PlainDate(2024, 1, 17));
      expect(state.isInvalid()).toBe(false);
    });
  });

  it("compares time bounds by clock time for zoned values", () => {
    return withRoot(() => {
      const state = createTimeFieldState({
        defaultValue: Temporal.ZonedDateTime.from("2024-10-12T08:00+02:00[Europe/Warsaw]"),
        minValue: Temporal.ZonedDateTime.from("2000-01-01T09:00+01:00[Europe/Warsaw]"),
      });

      expect(state.isInvalid()).toBe(true);
      state.setSegment("hour", 10);
      expect(state.isInvalid()).toBe(false);
    });
  });

  it("formats locale order, localized digits, and seconds", () => {
    return withRoot(() => {
      const state = createDateFieldState({
        defaultValue: Temporal.PlainDateTime.from("2024-10-12T15:32:17"),
        locale: "de-DE",
        granularity: "second",
        hourCycle: 24,
      });

      expect(
        state
          .segments()
          .filter((segment) => segment.isEditable)
          .map((segment) => segment.type),
      ).toEqual(["day", "month", "year", "hour", "minute", "second"]);

      const arabic = createDateFieldState({
        defaultValue: Temporal.PlainDate.from("2024-10-12"),
        locale: "ar-EG",
      });

      expect(arabic.segments().find((segment) => segment.type === "day")?.text).toBe("١٢");
      const emptyTime = createTimeFieldState({ locale: "ar-EG" });
      expect(emptyTime.segments().find((segment) => segment.type === "dayPeriod")?.text).toBe("ص");
    });
  });

  it("preserves a non-ISO calendar during editing", () => {
    return withRoot(() => {
      const state = createDateFieldState({
        defaultValue: Temporal.PlainDate.from("2024-10-12").withCalendar("hebrew"),
        locale: "en-US",
      });

      state.increment("day");
      expect(state.value()?.calendarId).toBe("hebrew");
      expect(state.value()?.withCalendar("iso8601").toString()).toBe("2024-10-13");
    });
  });

  it("retains the zoned subtype when a controlled value is cleared externally", () => {
    return withRoot(() => {
      const [value, setValue] = createSignal<Temporal.ZonedDateTime | null>(
        Temporal.ZonedDateTime.from("2024-10-12T15:30+02:00[Europe/Warsaw]"),
      );

      const state = createTimeFieldState({
        get value() {
          return value();
        },
        onChange: setValue,
        hourCycle: 24,
      });

      state.segments();
      setValue(null);
      state.segments();
      state.setSegment("hour", 16);
      state.setSegment("minute", 40);
      expect(value()?.toString()).toBe("2024-10-12T16:40:00+02:00[Europe/Warsaw]");
    });
  });

  it("ignores non-editable and unknown segments", () => {
    return withRoot(() => {
      const state = createDateFieldState({ defaultValue: Temporal.PlainDate.from("2024-01-01") });
      state.increment("literal");
      state.setSegment("timeZoneName", 1);
      state.clearSegment("era");
      expect(state.value()?.toString()).toBe("2024-01-01");
    });
  });
});

describe("review regressions", () => {
  it("displays the controlled value when the owner rejects an edit", () => {
    return withRoot(() => {
      const onChange = vi.fn();
      const state = createDateFieldState({ value: new Temporal.PlainDate(2024, 10, 12), onChange });
      state.increment("day");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(state.value()?.day).toBe(12);
      expect(state.segments().find((segment) => segment.type === "day")?.value).toBe(12);
    });
  });

  it("uses midnight/noon for Home and eleven for End in a 12-hour field", () => {
    return withRoot(() => {
      const state = createTimeFieldState({
        defaultValue: new Temporal.PlainTime(15, 30),
        hourCycle: 12,
      });

      state.setSegmentToLimit("hour", "min");
      expect(state.value()?.hour).toBe(12);
      state.setSegmentToLimit("hour", "max");
      expect(state.value()?.hour).toBe(23);
      state.setSegment("dayPeriod", 0);
      state.setSegmentToLimit("hour", "min");
      expect(state.value()?.hour).toBe(0);
    });
  });

  it("restores the original placeholder when an initially empty field is reset", () => {
    return withRoot(() => {
      const state = createDateFieldState({});
      const placeholder = state.displayValue().toString();
      state.setValue(new Temporal.PlainDate(2024, 10, 12));
      state.reset();
      expect(state.value()).toBeNull();
      expect(state.displayValue().toString()).toBe(placeholder);
    });
  });

  it("ignores segments that are absent from the field", () => {
    return withRoot(() => {
      const state = createTimeFieldState({ defaultValue: new Temporal.PlainTime(8, 30) });
      state.setSegment("year", 2024);
      state.increment("day");
      state.clearSegment("month");
      expect(state.value()?.toString()).toBe("08:30:00");
    });
  });

  it("does not confirm an incomplete placeholder into a value", () => {
    return withRoot(() => {
      const state = createDateFieldState({});
      state.setSegment("month", 10);
      state.confirmPlaceholder();
      expect(state.value()).toBeNull();
    });
  });
});

describe("Temporal calendar state", () => {
  it("builds six complete weeks with locale week starts", () => {
    return withRoot(() => {
      const date = Temporal.PlainDate.from("2024-02-15");
      const us = createCalendarState({ defaultValue: date, locale: "en-US" });
      const pl = createCalendarState({ defaultValue: date, locale: "pl-PL" });
      expect(us.weeks()).toHaveLength(6);
      expect(us.weeks()[0]?.[0]?.dayOfWeek).toBe(7);
      expect(pl.weeks()[0]?.[0]?.dayOfWeek).toBe(1);
      expect(
        us
          .weeks()
          .flat()
          .some((day) => day.toString() === "2024-02-29"),
      ).toBe(true);
    });
  });

  it("moves focus by days, weeks, months and years", () => {
    return withRoot(() => {
      const state = createCalendarState({
        defaultValue: Temporal.PlainDate.from("2024-01-31"),
        firstDayOfWeek: 1,
      });

      state.moveFocus("PageDown");
      expect(state.focusedDate().toString()).toBe("2024-02-29");
      state.moveFocus("PageDown", true);
      expect(state.focusedDate().toString()).toBe("2025-02-28");
      state.moveFocus("Home");
      expect(state.focusedDate().dayOfWeek).toBe(1);
      state.moveFocus("End");
      expect(state.focusedDate().dayOfWeek).toBe(7);
      const before = state.focusedDate();
      state.moveFocus("ArrowRight", false, true);
      expect(state.focusedDate().equals(before.subtract({ days: 1 }))).toBe(true);
    });
  });

  it("rejects unavailable dates and clamps keyboard navigation to bounds", () => {
    return withRoot(() => {
      const onChange = vi.fn();

      const state = createCalendarState({
        defaultValue: new Temporal.PlainDate(2024, 10, 12),
        minValue: new Temporal.PlainDate(2024, 10, 10),
        maxValue: new Temporal.PlainDate(2024, 10, 20),
        isDateUnavailable: (date) => date.day === 15,
        onChange,
      });

      state.selectDate(new Temporal.PlainDate(2024, 10, 15));
      state.selectDate(new Temporal.PlainDate(2024, 10, 21));
      expect(onChange).not.toHaveBeenCalled();
      state.moveFocus("PageDown");
      expect(state.focusedDate().day).toBe(20);
      state.selectDate(new Temporal.PlainDate(2024, 10, 18));
      expect(state.value()?.day).toBe(18);
      expect(onChange).toHaveBeenCalledTimes(1);
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
