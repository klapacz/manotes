import type { VariantProps } from "cva";
import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cva } from "../../lib/cva";

export const formVariants = cva({
  base: "",
  variants: {
    spacing: {
      default: "space-y-6",
      compact: "space-y-4",
    },
  },
  defaultVariants: {
    spacing: "default",
  },
});

export type FormProps = ComponentProps<"form"> & VariantProps<typeof formVariants>;

export const Form = (props: FormProps) => {
  const [, rest] = splitProps(props, ["class", "spacing"]);

  return (
    <form
      data-slot="form"
      class={formVariants({
        spacing: props.spacing,
        class: props.class,
      })}
      {...rest}
    />
  );
};
