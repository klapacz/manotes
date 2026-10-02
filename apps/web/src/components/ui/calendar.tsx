import * as CalendarPrimitive from "@kobalte/core/calendar";
import { Show, omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { cx } from "../../lib/cva";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { buttonVariants } from "./button";

// Styled Kobalte calendar parts. Replaces @corvu/calendar, which has no Solid 2
// build; class names keep the previous corvu-based styling.
export const Calendar = CalendarPrimitive.Root;

export const CalendarHeader = (props: ComponentProps<typeof CalendarPrimitive.Header>) => {
  const rest = omit(props, "class");

  return (
    <CalendarPrimitive.Header
      data-slot="calendar-header"
      class={cx("flex items-center justify-between pb-2", props.class)}
      {...rest}
    />
  );
};

const navClass = buttonVariants({
  variant: "outline",
  class: "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
});

export const CalendarPrevTrigger = () => (
  <CalendarPrimitive.PrevTrigger data-slot="calendar-nav" class={navClass}>
    <ChevronLeftIcon class="size-4" />
  </CalendarPrimitive.PrevTrigger>
);

export const CalendarNextTrigger = () => (
  <CalendarPrimitive.NextTrigger data-slot="calendar-nav" class={navClass}>
    <ChevronRightIcon class="size-4" />
  </CalendarPrimitive.NextTrigger>
);

export const CalendarHeading = () => (
  <CalendarPrimitive.Heading data-slot="calendar-label" class="text-sm font-medium" />
);

/** The month grid: weekday header and one row per week. */
export const CalendarGrid = () => (
  <CalendarPrimitive.Body>
    <CalendarPrimitive.Grid data-slot="calendar-table" weekDayFormat="narrow">
      <CalendarPrimitive.GridHeader>
        <CalendarPrimitive.GridHeaderRow>
          {(weekDay) => (
            <CalendarPrimitive.GridHeaderCell
              data-slot="calendar-head-cell"
              class="text-fg-subtle w-8 rounded-md text-[0.8rem] font-normal"
            >
              {weekDay()}
            </CalendarPrimitive.GridHeaderCell>
          )}
        </CalendarPrimitive.GridHeaderRow>
      </CalendarPrimitive.GridHeader>
      <CalendarPrimitive.GridBody>
        {(weekIndex) => (
          <CalendarPrimitive.GridBodyRow weekIndex={weekIndex()}>
            {(date) => (
              <Show when={date()} fallback={<td />}>
                {(date) => (
                  <CalendarPrimitive.GridBodyCell
                    date={date()}
                    data-slot="calendar-cell"
                    class="relative p-0 text-center text-sm focus-within:relative focus-within:z-20"
                  >
                    <CalendarPrimitive.GridBodyCellTrigger
                      data-slot="calendar-cell-trigger"
                      class={buttonVariants({
                        // plain: no hover/bg styles from the variant — we own every state
                        // below explicitly, avoiding specificity fights with shared hover rules.
                        variant: "plain",
                        class: [
                          "size-8 p-0 font-normal",
                          "hover:bg-control-hover hover:text-fg",
                          "data-outside-month:text-fg-subtle data-outside-month:opacity-50",
                          "not-data-selected:data-today:bg-control not-data-selected:data-today:text-fg",
                          "not-data-selected:data-today:hover:bg-control-hover",
                          "data-selected:bg-primary-solid data-selected:text-primary-fg-solid",
                          "data-selected:hover:bg-primary-solid-hover data-selected:hover:text-primary-fg-solid",
                        ],
                      })}
                    />
                  </CalendarPrimitive.GridBodyCell>
                )}
              </Show>
            )}
          </CalendarPrimitive.GridBodyRow>
        )}
      </CalendarPrimitive.GridBody>
    </CalendarPrimitive.Grid>
  </CalendarPrimitive.Body>
);
