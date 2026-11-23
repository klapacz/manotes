import type { Types } from "effect";
import type { StyledProps } from "../../lib/cva";
import { Dynamic, type ValidComponent, type ComponentProps } from "@solidjs/web";
import { omit } from "solid-js";
import * as SDK from "@ui-sdk/solid/menu";
import { Check, ChevronRight, Circle } from "@lucide/solid";
import { createLink } from "@tanstack/solid-router";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/ui/dropdown-menu.tsx
// Why: the sidebar graph switcher needs the shared dropdown menu primitives used by the shadcn-solid sidebar patterns.
// Modifications: replaced registry alias imports with local helpers and remapped shadcn design tokens to Manotes tokens.
export function DropdownMenuPortal(props: { children?: import("@solidjs/web").JSX.Element }) {
  return props.children;
}

export type DropdownMenuProps = StyledProps<typeof SDK.Menu> & { placement?: "bottom-start" };

export const DropdownMenu = (props: DropdownMenuProps) => {
  return <SDK.Menu data-slot="dropdown-menu" {...omit(props, "placement")} />;
};

export type DropdownMenuTriggerProps = StyledProps<typeof SDK.MenuTrigger> & {
  as?: ValidComponent;
};

export const DropdownMenuTrigger = (props: DropdownMenuTriggerProps) => {
  return (
    <SDK.MenuTrigger
      {...omit(props, "as")}
      render={props.as ? (part) => <Dynamic component={props.as} {...part} /> : props.render}
    />
  );
};

export type DropdownMenuGroupProps = StyledProps<typeof SDK.MenuGroup>;

export const DropdownMenuGroup = (props: DropdownMenuGroupProps) => {
  return <SDK.MenuGroup data-slot="dropdown-menu-group" {...props} />;
};

export type DropdownMenuSubProps = StyledProps<typeof SDK.MenuSub>;

export const DropdownMenuSub = (props: DropdownMenuSubProps) => {
  return <SDK.MenuSub data-slot="dropdown-menu-sub" {...props} />;
};

export type DropdownMenuRadioGroupProps = StyledProps<typeof SDK.MenuRadioGroup> & {
  onChange?: (value: string) => void;
};

export const DropdownMenuRadioGroup = (props: DropdownMenuRadioGroupProps) => {
  return (
    <SDK.MenuRadioGroup
      data-slot="dropdown-menu-radio-group"
      {...omit(props, "onChange")}
      onValueChange={(value) => {
        if (value !== null) props.onChange?.(value);
      }}
    />
  );
};

export type DropdownMenuSubTriggerProps = StyledProps<typeof SDK.MenuSubTrigger> & {
  inset?: boolean;
};

export const DropdownMenuSubTrigger = (props: DropdownMenuSubTriggerProps) => {
  const rest = omit(props, "class", "children", "inset");

  return (
    <SDK.MenuSubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={props.inset}
      class={cx(
        "data-[highlighted]:bg-control-hover data-[highlighted]:text-fg data-[open]:bg-control-hover data-[open]:text-fg flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      {...rest}
    >
      {props.children}
      <ChevronRight class="ml-auto" />
    </SDK.MenuSubTrigger>
  );
};

export type DropdownMenuSubContentProps = StyledProps<typeof SDK.MenuSubContent>;

export const DropdownMenuSubContent = (props: DropdownMenuSubContentProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.MenuSubContent
      data-slot="dropdown-menu-sub-content"
      class={cx(
        "bg-bg-subtle text-fg data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95 border-border-subtle z-50 min-w-[8rem] origin-(--transform-origin) [--kb-popper-content-available-height:var(--available-height)] overflow-hidden rounded-md border p-1 shadow-lg outline-none",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=right]:slide-in-from-left-2 data-[side=left]:slide-in-from-right-2",
        props.class,
      )}
      {...rest}
    />
  );
};

export type DropdownMenuContentProps = StyledProps<typeof SDK.MenuContent>;

export const DropdownMenuContent = (props: DropdownMenuContentProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.MenuContent
      data-slot="dropdown-menu-content"
      class={cx(
        "bg-bg-subtle text-fg data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95 border-border-subtle z-50 min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-none",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=right]:slide-in-from-left-2 data-[side=left]:slide-in-from-right-2",
        props.class,
      )}
      {...rest}
    />
  );
};

export type DropdownMenuItemProps = StyledProps<typeof SDK.MenuItem> & {
  inset?: boolean;
  variant?: "default" | "destructive";
};

export const DropdownMenuItem = (props: DropdownMenuItemProps) => {
  const rest = omit(props, "class", "inset", "variant");

  return (
    <SDK.MenuItem
      data-slot="dropdown-menu-item"
      data-inset={props.inset}
      data-variant={props.variant}
      class={cx(
        "data-[highlighted]:bg-control-hover data-[highlighted]:text-fg data-[variant=destructive]:text-error-fg data-[variant=destructive]:data-[highlighted]:bg-error-bg-subtle data-[variant=destructive]:data-[highlighted]:text-error-fg data-[variant=destructive]:*:[svg]:!text-error-fg [&_svg:not([class*='text-'])]:text-fg-subtle relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      {...rest}
    />
  );
};

type DropdownMenuItemLinkRootProps = Types.MergeRight<
  ComponentProps<"a">,
  Omit<DropdownMenuItemProps, "render">
>;

const DropdownMenuItemLinkRoot = (props: DropdownMenuItemLinkRootProps) => {
  return <DropdownMenuItem {...props} render={(part) => <a {...part} />} />;
};

export const DropdownMenuItemLink = createLink(DropdownMenuItemLinkRoot);

export type DropdownMenuCheckboxItemProps = StyledProps<typeof SDK.MenuCheckboxItem>;

export const DropdownMenuCheckboxItem = (props: DropdownMenuCheckboxItemProps) => {
  const rest = omit(props, "class", "children");

  return (
    <SDK.MenuCheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      class={cx(
        "data-[highlighted]:bg-control-hover data-[highlighted]:text-fg relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <SDK.MenuItemIndicator>
          <Check class="size-4" />
        </SDK.MenuItemIndicator>
      </span>
      {props.children}
    </SDK.MenuCheckboxItem>
  );
};

export type DropdownMenuRadioItemProps = StyledProps<typeof SDK.MenuRadioItem>;

export const DropdownMenuRadioItem = (props: DropdownMenuRadioItemProps) => {
  const rest = omit(props, "class", "children");

  return (
    <SDK.MenuRadioItem
      data-slot="dropdown-menu-radio-item"
      class={cx(
        "data-[highlighted]:bg-control-hover data-[highlighted]:text-fg relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
      {...rest}
    >
      <span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <SDK.MenuItemIndicator>
          <Circle class="size-2 fill-current" />
        </SDK.MenuItemIndicator>
      </span>
      {props.children}
    </SDK.MenuRadioItem>
  );
};

export type DropdownMenuGroupLabelProps = StyledProps<typeof SDK.MenuGroupLabel> & {
  inset?: boolean;
};

export const DropdownMenuGroupLabel = (props: DropdownMenuGroupLabelProps) => {
  const rest = omit(props, "class", "inset");

  return (
    <SDK.MenuGroupLabel
      data-slot="dropdown-menu-group-label"
      data-inset={props.inset}
      class={cx("text-fg my-1.5 px-2 text-sm font-medium data-[inset]:pl-8", props.class)}
      {...rest}
    />
  );
};

export type DropdownMenuItemLabelProps = ComponentProps<"span"> & {
  inset?: boolean;
};

export const DropdownMenuItemLabel = (props: DropdownMenuItemLabelProps) => {
  const rest = omit(props, "class", "inset");

  return (
    <span
      data-slot="dropdown-menu-item-label"
      data-inset={props.inset}
      class={cx("text-fg px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", props.class)}
      {...rest}
    />
  );
};

export type DropdownMenuSeparatorProps = StyledProps<typeof SDK.MenuSeparator>;

export const DropdownMenuSeparator = (props: DropdownMenuSeparatorProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.MenuSeparator
      data-slot="dropdown-menu-separator"
      class={cx("bg-border-subtle -mx-1 my-1 h-px", props.class)}
      {...rest}
    />
  );
};

export type DropdownMenuShortcutProps = ComponentProps<"span">;

export const DropdownMenuShortcut = (props: DropdownMenuShortcutProps) => {
  const rest = omit(props, "class");

  return (
    <span
      data-slot="dropdown-menu-shortcut"
      class={cx("text-fg-subtle ml-auto text-xs tracking-widest", props.class)}
      {...rest}
    />
  );
};
