import { omit } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { cx } from "../../lib/cva";

export function Root(props: ComponentProps<"dl">) {
  const rest = omit(props, "class");

  return (
    <dl
      class={cx("@container/description-list divide-y divide-border-subtle", props.class)}
      {...rest}
    />
  );
}

export function Row(props: ComponentProps<"div">) {
  const rest = omit(props, "class");

  return (
    <div
      class={cx(
        "grid grid-cols-1 items-start gap-x-3 py-1 @sm/description-list:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]",
        props.class,
      )}
      {...rest}
    />
  );
}

export function Term(props: ComponentProps<"dt">) {
  const rest = omit(props, "class");

  return <dt class={cx("min-w-0 px-2 py-1 text-fg-subtle wrap-anywhere", props.class)} {...rest} />;
}

export function Details(props: ComponentProps<"dd">) {
  const rest = omit(props, "class");

  return <dd class={cx("min-w-0", props.class)} {...rest} />;
}

export * as DescriptionList from "./description-list";
