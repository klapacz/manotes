import type { StyledProps } from "../../lib/cva";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import * as SDK from "@ui-sdk/solid/command";
import { cx } from "../../lib/cva";
import { SearchIcon } from "../icons";

export const commandSurfaceClass = "bg-bg text-fg overflow-hidden rounded-md";

export const commandRootClass = `${commandSurfaceClass} flex h-full w-full flex-col`;

export const commandListClass =
  "max-h-[var(--command-list-height,300px)] scroll-py-1 overflow-x-hidden overflow-y-auto";

export const commandEmptyClass = "py-6 text-center text-sm";

export const commandItemBaseClass =
  "[&_svg:not([class*='text-'])]:text-fg-subtle relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const commandItemSelectedClass =
  "data-[highlighted]:bg-control-hover data-[highlighted]:text-fg";

export type CommandProps = StyledProps<typeof SDK.Command>;

export function Command(props: CommandProps) {
  return <SDK.Command {...omit(props, "class")} loop class={cx(commandRootClass, props.class)} />;
}

export type CommandInputProps = StyledProps<typeof SDK.CommandInput>;

export function CommandInput(props: CommandInputProps) {
  return (
    <div
      data-slot="command-input-wrapper"
      class="border-border flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon class="size-4 shrink-0 opacity-50" />
      <SDK.CommandInput
        {...omit(props, "class")}
        class={cx(
          "placeholder:text-fg-subtle flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
          props.class,
        )}
      />
    </div>
  );
}

export function CommandList(props: StyledProps<typeof SDK.CommandList>) {
  return (
    <SDK.CommandList
      {...omit(props, "class", "children")}
      class={cx("overflow-hidden", props.class)}
    >
      <div class="flex max-h-[var(--command-list-height,300px)] flex-col">{props.children}</div>
    </SDK.CommandList>
  );
}

export function CommandScroll(props: ComponentProps<"div">) {
  return (
    <div
      data-command-scroll=""
      {...omit(props, "class")}
      class={cx(commandListClass, "min-h-0 p-1", props.class)}
    />
  );
}

export type CommandItemProps = StyledProps<typeof SDK.CommandItem>;

export function CommandItem(props: CommandItemProps) {
  return (
    <SDK.CommandItem
      {...omit(props, "class")}
      class={cx(commandItemBaseClass, commandItemSelectedClass, props.class)}
    />
  );
}
