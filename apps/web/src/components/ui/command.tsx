import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";
import { Command as CommandPrimitive } from "cmdk-solid";

import { cx } from "../../lib/cva";
import { SearchIcon } from "../icons";

export type CommandProps = ComponentProps<typeof CommandPrimitive>;

export const commandSurfaceClass = "bg-bg text-fg overflow-hidden rounded-md";

export const commandRootClass = `${commandSurfaceClass} flex h-full w-full flex-col`;

export const commandDialogClass =
  "bg-bg text-fg [&_[cmdk-group-heading]]:text-fg-subtle flex h-full w-full flex-col overflow-hidden rounded-md **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5";

export const commandListClass = "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto";

export const commandEmptyClass = "py-6 text-center text-sm";

export const commandGroupHeadingClass = "text-fg-subtle px-2 py-1.5 text-xs font-medium";

export const commandItemBaseClass =
  "[&_svg:not([class*='text-'])]:text-fg-subtle relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const commandItemSelectedClass =
  "data-[selected=true]:bg-control-hover data-[selected=true]:text-fg";

export const Command = (props: CommandProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive data-slot="command" class={cx(commandRootClass, props.class)} {...rest} />
  );
};

export type CommandDialogProps = ComponentProps<typeof CommandPrimitive.Dialog> & {
  title?: string;
  description?: string;
};

export const CommandDialog = (props: CommandDialogProps) => {
  const [, rest] = splitProps(props, ["contentClassName", "overlayClassName", "class"]);

  return (
    <CommandPrimitive.Dialog
      data-slot="command-dialog"
      contentClassName={cx(
        "bg-bg data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-lg shadow-lg duration-200 sm:max-w-lg",
        props.contentClassName,
      )}
      overlayClassName={cx(
        "data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 bg-overlay fixed inset-0 z-50",
        props.overlayClassName,
      )}
      class={cx(commandDialogClass, props.class)}
      {...rest}
    />
  );
};

export type CommandInputProps = ComponentProps<typeof CommandPrimitive.Input>;

export const CommandInput = (props: CommandInputProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="command-input-wrapper"
      class="border-border flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon class="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        class={cx(
          "placeholder:text-fg-subtle flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
          props.class,
        )}
        {...rest}
      />
    </div>
  );
};

export type CommandListProps = ComponentProps<typeof CommandPrimitive.List>;

export const CommandList = (props: CommandListProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive.List
      data-slot="command-list"
      class={cx(commandListClass, props.class)}
      {...rest}
    />
  );
};

export type CommandEmptyProps = ComponentProps<typeof CommandPrimitive.Empty>;

export const CommandEmpty = (props: CommandEmptyProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      class={cx(commandEmptyClass, props.class)}
      {...rest}
    />
  );
};

export type CommandLabelProps = ComponentProps<"div">;

export const CommandLabel = (props: CommandLabelProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="command-label" class={cx(commandGroupHeadingClass, props.class)} {...rest} />
  );
};

export type CommandGroupProps = ComponentProps<typeof CommandPrimitive.Group>;

export const CommandGroup = (props: CommandGroupProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      class={cx(
        "text-fg [&_[cmdk-group-heading]]:text-fg-subtle overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        props.class,
      )}
      {...rest}
    />
  );
};

export type CommandSeparatorProps = ComponentProps<typeof CommandPrimitive.Separator>;

export const CommandSeparator = (props: CommandSeparatorProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      class={cx("bg-border -mx-1 h-px", props.class)}
      {...rest}
    />
  );
};

export type CommandItemProps = ComponentProps<typeof CommandPrimitive.Item>;

export const CommandItem = (props: CommandItemProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      class={cx(commandItemBaseClass, commandItemSelectedClass, props.class)}
      {...rest}
    />
  );
};

export type CommandShortcutProps = ComponentProps<"span">;

export const CommandShortcut = (props: CommandShortcutProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <span
      data-slot="command-shortcut"
      class={cx("text-fg-subtle ml-auto text-xs tracking-widest", props.class)}
      {...rest}
    />
  );
};
