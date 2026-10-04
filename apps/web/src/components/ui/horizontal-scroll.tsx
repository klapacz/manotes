import type { ParentProps } from "solid-js";
import { cx } from "../../lib/cva";

export function HorizontalScroll(props: ParentProps<{ class?: string; contentClass?: string }>) {
  return (
    <div
      class={cx("min-w-0 overflow-x-auto [scrollbar-width:thin]", props.class)}
      style={{
        "mask-image":
          "linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)",
      }}
    >
      <div
        class={cx(
          "flex w-max min-w-full items-center whitespace-nowrap px-4 *:shrink-0",
          props.contentClass,
        )}
      >
        {props.children}
      </div>
    </div>
  );
}
