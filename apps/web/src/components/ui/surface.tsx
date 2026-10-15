import { splitProps, type ComponentProps, type JSX } from "solid-js";
import { cx } from "../../lib/cva";

export function Root(props: ComponentProps<"div"> & { highlighted?: boolean }): JSX.Element {
  const [, rest] = splitProps(props, ["class", "highlighted"]);

  return (
    <div
      data-slot="surface"
      data-highlighted={props.highlighted}
      class={cx(
        "rounded-lg bg-bg-subtle p-2 text-sm transition-colors data-[highlighted=true]:bg-control",
        props.class,
      )}
      {...rest}
    />
  );
}

export function Header(props: ComponentProps<"div">): JSX.Element {
  const [, rest] = splitProps(props, ["class"]);

  return <div class={cx("flex flex-wrap items-center gap-2 px-2 pb-2", props.class)} {...rest} />;
}

export function Error(props: ComponentProps<"p">): JSX.Element {
  const [, rest] = splitProps(props, ["class"]);

  return <p role="alert" class={cx("px-2 pt-2 text-error-fg", props.class)} {...rest} />;
}

export * as Surface from "./surface";
