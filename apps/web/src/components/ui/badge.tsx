import { Badge as BadgePrimitive } from "@kobalte/core/badge";
import type { VariantProps } from "cva";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cva } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/badge.tsx
// Why: graph list surfaces needed a shared status badge primitive.
// Modifications: replaced registry alias imports with the local cva helper and remapped variants to Manotes tokens.
export const badgeVariants = cva({
  base: "inline-flex w-fit items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 transition-[color,box-shadow]",
  variants: {
    variant: {
      default: "border-transparent bg-primary-control text-primary-fg",
      secondary: "border-transparent bg-control text-fg",
      destructive: "border-transparent bg-error-control text-error-fg",
      outline: "border-border bg-transparent text-fg-subtle",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type BadgeProps<T extends ValidComponent = "span"> = ComponentProps<
  typeof BadgePrimitive<T>
> &
  VariantProps<typeof badgeVariants>;

export const Badge = <T extends ValidComponent = "span">(props: BadgeProps<T>) => {
  const [, rest] = splitProps(props as BadgeProps, ["class", "variant"]);

  return (
    <BadgePrimitive
      data-slot="badge"
      class={badgeVariants({
        variant: props.variant,
        class: props.class,
      })}
      {...rest}
    />
  );
};
