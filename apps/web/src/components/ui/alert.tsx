import { Alert as AlertPrimitive } from "@kobalte/core/alert";
import type { VariantProps } from "cva";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cva, cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/alert.tsx
// Why: pre-graph routes repeated inline error and warning blocks with no shared styling.
// Modifications: replaced registry alias imports with local helpers, simplified the layout, and added warning and success variants using Manotes tokens.
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

export type AlertProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof AlertPrimitive<T>
> &
  VariantProps<typeof alertVariants>;

export const Alert = <T extends ValidComponent = "div">(props: AlertProps<T>) => {
  // SAFETY: Erasing the polymorphic parameter lets Solid split wrapper-owned keys; all other props are forwarded unchanged to the same primitive.
  const [, rest] = splitProps(props as AlertProps, ["class", "variant"]);

  return (
    <AlertPrimitive
      data-slot="alert"
      class={alertVariants({
        variant: props.variant,
        class: props.class,
      })}
      {...rest}
    />
  );
};

export type AlertTitleProps = ComponentProps<"div">;

export const AlertTitle = (props: AlertTitleProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="alert-title" class={cx("font-medium tracking-tight", props.class)} {...rest} />
  );
};

export type AlertDescriptionProps = ComponentProps<"div">;

export const AlertDescription = (props: AlertDescriptionProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="alert-description"
      class={cx(
        "grid gap-1 text-sm leading-relaxed text-current [&_p]:leading-relaxed",
        props.class,
      )}
      {...rest}
    />
  );
};
