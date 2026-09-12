import { Root as ButtonPrimitive } from "@kobalte/core/button";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cx } from "../../lib/cva";

export type LinkButtonProps<T extends ValidComponent = "button"> = ComponentProps<
  typeof ButtonPrimitive<T>
>;

export const LinkButton = <T extends ValidComponent = "button">(props: LinkButtonProps<T>) => {
  // SAFETY: Erasing the polymorphic parameter lets Solid split wrapper-owned keys; all other props are forwarded unchanged to the same primitive.
  const [, rest] = splitProps(props as LinkButtonProps, ["class"]);

  return (
    <ButtonPrimitive
      type="button"
      data-slot="link-button"
      class={cx(
        "rounded px-1 text-xs text-fg-subtle underline-offset-4 outline-none",
        "hover:bg-control-hover hover:text-fg hover:underline",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px]",
        props.class,
      )}
      {...rest}
    />
  );
};
