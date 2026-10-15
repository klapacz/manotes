import { splitProps, type ComponentProps, type JSX } from "solid-js";
import { cx } from "../../lib/cva";

// Adapted from shadcn/ui at 4233ed1caded8c38f4bc14b14afe1f93ebcaf966.
// Source: apps/v4/registry/new-york-v4/ui/button-group.tsx
// Why: join related inputs, pickers, and action buttons into one control.
// Modifications: ported to Solid with the local cx helper; kept horizontal grouping only.
export function Root(props: ComponentProps<"div">): JSX.Element {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      role="group"
      data-slot="button-group"
      class={cx(
        "flex w-fit items-stretch [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
        props.class,
      )}
      {...rest}
    />
  );
}

export * as ButtonGroup from "./button-group";
