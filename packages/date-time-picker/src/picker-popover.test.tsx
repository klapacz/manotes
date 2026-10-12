// oxlint-disable typescript/unbound-method -- Testing Library queries are bound to their containers.
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { DatePicker } from "./date-picker";
import { DateRangePicker } from "./date-range-picker";

describe.each(["date", "range"])("%s picker popover", (kind) => {
  it("allows page scrolling while containing focus and restoring it on dismissal", async () => {
    const user = userEvent.setup();
    const date = new Temporal.PlainDate(2024, 10, 12);
    render(() => {
      return kind === "date" ? (
        <DatePicker label="Trip" defaultValue={date} />
      ) : (
        <DateRangePicker label="Trip" defaultValue={{ start: date, end: date.add({ days: 6 }) }} />
      );
    });

    const trigger = screen.getByRole("button", {
      name: kind === "date" ? "Choose date, Trip" : "Choose date range, Trip",
    });

    const originalPadding = document.body.style.paddingRight;
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Saturday, October 12, 2024");
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.body.style.paddingRight).toBe(originalPadding);
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    fireEvent.pointerDown(document.documentElement, { pointerType: "mouse", button: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
