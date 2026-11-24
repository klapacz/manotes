import type { StyledProps } from "../../lib/cva";
import { merge, omit } from "solid-js";
import * as SDK from "@ui-sdk/solid/popover";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/ui/popover.tsx
// Why: this repo was missing the shared popover primitive that commonly accompanies the shadcn-solid dropdown/sidebar stack.
// Modifications: replaced registry alias imports with local helpers and remapped shadcn design tokens to Manotes tokens.
export function PopoverPortal(props: { children?: import("@solidjs/web").JSX.Element }) {
  return props.children;
}

export type PopoverProps = StyledProps<typeof SDK.Popover>;

export const Popover = (props: PopoverProps) => {
  const mergedProps = merge({}, props);

  return <SDK.Popover data-slot="popover" {...mergedProps} />;
};

export type PopoverTriggerProps = StyledProps<typeof SDK.PopoverTrigger>;

export const PopoverTrigger = (props: PopoverTriggerProps) => {
  return <SDK.PopoverTrigger data-slot="popover-trigger" {...props} />;
};

export type PopoverContentProps = StyledProps<typeof SDK.PopoverContent>;

export const PopoverContent = (props: PopoverContentProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.PopoverContent
      data-slot="popover-content"
      class={cx(
        // Uses GPU-composited @theme keyframes; keep opacity-0 if @ui-sdk strips
        // data-ending-style before the closed popover unmounts.
        "bg-bg-subtle text-fg border-border-subtle data-[open]:animate-popover-in data-[ending-style]:animate-popover-out [&[data-closed]:not([data-ending-style])]:opacity-0 will-change-[transform,opacity] motion-reduce:animate-none z-50 w-72 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        props.class,
      )}
      {...rest}
    />
  );
};
