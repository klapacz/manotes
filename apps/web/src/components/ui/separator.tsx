import { Root as SeparatorPrimitive } from "@kobalte/core/separator";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/separator.tsx
// Why: the pre-graph home route needed a reusable divider between graph sections.
// Modifications: replaced registry alias imports with the local cva helper and remapped the separator color to Manotes tokens.
export type SeparatorProps<T extends ValidComponent = "hr"> = ComponentProps<
  typeof SeparatorPrimitive<T>
>;

export const Separator = <T extends ValidComponent = "hr">(props: SeparatorProps<T>) => {
  const [, rest] = splitProps(props as SeparatorProps, ["class"]);

  return (
    <SeparatorPrimitive
      data-slot="separator"
      class={cx(
        "bg-border-subtle shrink-0 border-none data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        props.class,
      )}
      {...rest}
    />
  );
};
