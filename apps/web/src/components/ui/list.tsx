import type { VariantProps } from "cva";
import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";

import { cva, cx } from "../../lib/cva";

export type ListProps = ComponentProps<"ul">;

export const List = (props: ListProps) => {
  const rest = omit(props, "class");

  return <ul data-slot="list" class={cx("flex flex-col gap-3", props.class)} {...rest} />;
};

export const listItemVariants = cva({
  base: "bg-bg text-fg rounded-xl border border-border-subtle",
  variants: {
    interactive: {
      true: "transition-colors hover:bg-bg",
      false: "",
    },
    dashed: {
      true: "border-dashed",
      false: "",
    },
  },
  defaultVariants: {
    interactive: false,
    dashed: false,
  },
});

export type ListItemProps = ComponentProps<"li"> & VariantProps<typeof listItemVariants>;

export const ListItem = (props: ListItemProps) => {
  const rest = omit(props, "class", "interactive", "dashed");

  return (
    <li
      data-slot="list-item"
      class={listItemVariants({
        interactive: props.interactive,
        dashed: props.dashed,
        class: props.class,
      })}
      {...rest}
    />
  );
};
