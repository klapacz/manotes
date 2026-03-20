import type { ComponentProps, ValidComponent } from "solid-js";
import { Match, Switch, splitProps } from "solid-js";
import CalendarPrimitive from "@corvu/calendar";
import { cx } from "../../lib/cva";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";
import { buttonVariants } from "./button";

export type CalendarProps = ComponentProps<typeof CalendarPrimitive>;

export const Calendar = (props: CalendarProps) => {
  return <CalendarPrimitive data-slot="calendar" {...props} />;
};

export type CalendarNavProps<T extends ValidComponent = "button"> =
  ComponentProps<typeof CalendarPrimitive.Nav<T>>;

export const CalendarNav = <T extends ValidComponent = "button">(
  props: CalendarNavProps<T>,
) => {
  const [, rest] = splitProps(props as CalendarNavProps, ["action", "class"]);

  return (
    <CalendarPrimitive.Nav
      data-slot="calendar-nav"
      action={props.action}
      class={buttonVariants({
        variant: "outline",
        class: [
          "size-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          props.class,
        ],
      })}
      {...rest}
    >
      <Switch>
        <Match
          when={props.action === "prev-year" || props.action === "prev-month"}
        >
          <ChevronLeftIcon class="size-4" />
        </Match>
        <Match
          when={props.action === "next-year" || props.action === "next-month"}
        >
          <ChevronRightIcon class="size-4" />
        </Match>
      </Switch>
    </CalendarPrimitive.Nav>
  );
};

export type CalendarLabelProps<T extends ValidComponent = "h2"> =
  ComponentProps<typeof CalendarPrimitive.Label<T>>;

export const CalendarLabel = <T extends ValidComponent = "h2">(
  props: CalendarLabelProps<T>,
) => {
  const [, rest] = splitProps(props as CalendarLabelProps, ["class"]);

  return (
    <CalendarPrimitive.Label
      data-slot="calendar-label"
      class={cx("text-sm font-medium", props.class)}
      {...rest}
    />
  );
};

export type CalendarTableProps<T extends ValidComponent = "table"> =
  ComponentProps<typeof CalendarPrimitive.Table<T>>;

export const CalendarTable = <T extends ValidComponent = "table">(
  props: CalendarTableProps<T>,
) => {
  return <CalendarPrimitive.Table data-slot="calendar-table" {...props} />;
};

export type CalendarHeadCellProps<T extends ValidComponent = "th"> =
  ComponentProps<typeof CalendarPrimitive.HeadCell<T>>;

export const CalendarHeadCell = <T extends ValidComponent = "th">(
  props: CalendarHeadCellProps<T>,
) => {
  const [, rest] = splitProps(props as CalendarHeadCellProps, ["class"]);

  return (
    <CalendarPrimitive.HeadCell
      data-slot="calendar-head-cell"
      class={cx(
        "text-fg-subtle w-8 rounded-md text-[0.8rem] font-normal",
        props.class,
      )}
      {...rest}
    />
  );
};

export type CalendarCellProps<T extends ValidComponent = "td"> = ComponentProps<
  typeof CalendarPrimitive.Cell<T>
>;

export const CalendarCell = <T extends ValidComponent = "td">(
  props: CalendarCellProps<T>,
) => {
  const [, rest] = splitProps(props as CalendarCellProps, ["class"]);

  return (
    <CalendarPrimitive.Cell
      data-slot="calendar-cell"
      class={cx(
        "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        props.class,
      )}
      {...rest}
    />
  );
};

export type CalendarCellTriggerProps<T extends ValidComponent = "button"> =
  ComponentProps<typeof CalendarPrimitive.CellTrigger<T>>;

export const CalendarCellTrigger = <T extends ValidComponent = "button">(
  props: CalendarCellTriggerProps<T>,
) => {
  const [, rest] = splitProps(props as CalendarCellTriggerProps, ["class"]);

  return (
    <CalendarPrimitive.CellTrigger
      data-slot="calendar-cell-trigger"
      class={buttonVariants({
        // plain: no hover/bg styles from the variant — we own every state
        // below explicitly, avoiding specificity fights with shared hover rules.
        variant: "plain",
        class: [
          "size-8 p-0 font-normal",
          "hover:bg-control-hover hover:text-fg",
          "not-aria-selected:data-today:bg-control not-aria-selected:data-today:text-fg",
          "not-aria-selected:data-today:hover:bg-control-hover",
          "aria-selected:bg-primary-solid aria-selected:text-primary-fg-solid",
          "aria-selected:hover:bg-primary-solid-hover aria-selected:hover:text-primary-fg-solid",
          props.class,
        ],
      })}
      {...rest}
    />
  );
};
