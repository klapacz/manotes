import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { cx } from "../../lib/cva";

export function Root(props: ComponentProps<"dl">) {
  const rest = omit(props, "class");

  return <dl class={cx("divide-y divide-border-subtle", props.class)} {...rest} />;
}

export function Row(props: ComponentProps<"div">) {
  const rest = omit(props, "class");

  return (
    <div
      class={cx(
        "grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-start gap-3 py-1",
        props.class,
      )}
      {...rest}
    />
  );
}

export function Term(props: ComponentProps<"dt">) {
  const rest = omit(props, "class");

  return <dt class={cx("min-w-0 px-2 py-1 text-fg-subtle", props.class)} {...rest} />;
}

export function Details(props: ComponentProps<"dd">) {
  const rest = omit(props, "class");

  return <dd class={cx("min-w-0", props.class)} {...rest} />;
}

export * as DescriptionList from "./description-list";
