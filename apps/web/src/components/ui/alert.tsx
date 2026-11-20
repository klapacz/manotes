import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import type { VariantProps } from "cva";
import { cva, cx } from "../../lib/cva";

export const alertVariants = cva({
  base: "relative w-full rounded-lg border px-4 py-3 text-sm",
  variants: {
    variant: {
      default: "border-border-subtle bg-bg-subtle text-fg",
      destructive: "border-error-border-subtle bg-error-bg-subtle text-error-fg",
      warning: "border-warning-border-subtle bg-warning-bg-subtle text-warning-fg",
      success: "border-success-border-subtle bg-success-bg-subtle text-success-fg",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function Alert(props: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role="alert"
      {...omit(props, "class", "variant")}
      class={alertVariants({ variant: props.variant, class: props.class })}
    />
  );
}

export function AlertDescription(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      {...omit(props, "class")}
      class={cx(
        "grid gap-1 text-sm leading-relaxed text-current [&_p]:leading-relaxed",
        props.class,
      )}
    />
  );
}
