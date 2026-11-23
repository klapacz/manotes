import { cva } from "../../lib/cva";
import type { StyledProps } from "../../lib/cva";
import { omit } from "solid-js";
import { Dynamic, type ValidComponent } from "@solidjs/web";
import { Button as Primitive } from "@ui-sdk/solid/button";
import type { VariantProps } from "cva";

export const buttonVariants = cva({
  base: [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all shrink-0 outline-none",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:transition-colors",
    "focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px]",
    "aria-[invalid=true]:border-error-border aria-[invalid=true]:ring-error-border/30",
  ],

  variants: {
    variant: {
      default: "bg-primary-solid text-primary-fg-solid hover:bg-primary-solid-hover",
      destructive:
        "bg-error-solid text-error-fg-solid hover:bg-error-solid-hover focus-visible:border-error-border focus-visible:ring-error-border/30",
      outline:
        "border border-border bg-bg text-fg shadow-xs hover:bg-control-hover [&_svg]:text-fg-subtle hover:[&_svg]:text-fg",
      secondary:
        "bg-control text-fg hover:bg-control-hover [&_svg]:text-fg-subtle hover:[&_svg]:text-fg",
      ghost: "text-fg hover:bg-control-hover [&_svg]:text-fg-subtle hover:[&_svg]:text-fg",
      // No background or hover styles - caller owns all visual states.
      // Use when shared button hovers would fight custom state styling.
      plain: "",
      link: "text-primary-fg underline-offset-4 hover:text-primary-fg-subtle hover:underline",
    },
    size: {
      default: "h-9 px-4 py-2 has-[>svg]:px-3",
      xs: "h-7 max-w-full gap-1.5 px-2 py-1 text-sm font-normal",
      sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
      lg: "h-10 px-6 has-[>svg]:px-4",
      chip: "h-7 max-w-full gap-1.5 px-2 text-xs",
      icon: "size-9",
      "icon-sm": "size-8",
      "icon-xs": "size-7",
      "icon-lg": "size-10",
    },
    rounded: {
      default: "rounded-md",
      full: "rounded-full",
      none: "rounded-none",
    },
    intent: {
      error: "bg-error-control text-error-fg hover:bg-error-control-hover",
      warning: "bg-warning-control text-warning-fg hover:bg-warning-control-hover",
    },
    inline: {
      true: "inline-block h-auto min-w-0 shrink whitespace-normal text-left wrap-anywhere [&_svg]:inline [&_svg]:align-middle",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
    rounded: "default",
  },
});

export type ButtonProps = StyledProps<typeof Primitive> &
  VariantProps<typeof buttonVariants> & {
    as?: ValidComponent;
    href?: string;
  };

export function Button(props: ButtonProps) {
  const rest = omit(props, "class", "variant", "size", "rounded", "intent", "inline", "as");

  return (
    <Primitive
      {...rest}
      render={props.as ? (part) => <Dynamic component={props.as} {...part} /> : props.render}
      class={buttonVariants({
        variant: props.variant,
        size: props.size,
        rounded: props.rounded,
        intent: props.intent,
        inline: props.inline,
        class: props.class,
      })}
    />
  );
}
