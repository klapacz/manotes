import type { ComponentProps, ValidComponent } from "solid-js";
import { mergeProps, splitProps } from "solid-js";
import { Popover as PopoverPrimitive } from "@kobalte/core/popover";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/ui/popover.tsx
// Why: this repo was missing the shared popover primitive that commonly accompanies the shadcn-solid dropdown/sidebar stack.
// Modifications: replaced registry alias imports with local helpers and remapped shadcn design tokens to Manotes tokens.
export const PopoverPortal = PopoverPrimitive.Portal;

export type PopoverProps = ComponentProps<typeof PopoverPrimitive>;

export const Popover = (props: PopoverProps) => {
  const mergedProps = mergeProps<PopoverProps[]>(
    {
      gutter: 4,
    },
    props,
  );

  return <PopoverPrimitive data-slot="popover" {...mergedProps} />;
};

export type PopoverTriggerProps<T extends ValidComponent = "button"> = ComponentProps<
  typeof PopoverPrimitive.Trigger<T>
>;

export const PopoverTrigger = <T extends ValidComponent = "button">(
  props: PopoverTriggerProps<T>,
) => {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
};

export type PopoverContentProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof PopoverPrimitive.Content<T>
>;

export const PopoverContent = <T extends ValidComponent = "div">(props: PopoverContentProps<T>) => {
  const [, rest] = splitProps(props as PopoverContentProps, ["class"]);

  return (
    <PopoverPrimitive.Content
      data-slot="popover-content"
      class={cx(
        "bg-bg-subtle text-fg data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 border-border-subtle z-50 w-72 origin-(--kb-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        "[[data-popper-positioner][style*='--kb-popper-content-transform-origin:_top']>[data-slot=popover-content]]:slide-in-from-top-2 [[data-popper-positioner][style*='--kb-popper-content-transform-origin:_bottom']>[data-slot=popover-content]]:slide-in-from-bottom-2 [[data-popper-positioner][style*='--kb-popper-content-transform-origin:_left']>[data-slot=popover-content]]:slide-in-from-left-2 [[data-popper-positioner][style*='--kb-popper-content-transform-origin:_right']>[data-slot=popover-content]]:slide-in-from-right-2",
        props.class,
      )}
      {...rest}
    />
  );
};
