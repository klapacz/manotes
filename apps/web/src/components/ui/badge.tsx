import { cva } from "../../lib/cva";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import type { VariantProps } from "cva";

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

export function Badge(props: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      {...omit(props, "class", "variant")}
      class={badgeVariants({ variant: props.variant, class: props.class })}
    />
  );
}
