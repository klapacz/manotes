import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/text-field.tsx
// Why: this app was missing a shared label primitive for form-heavy pre-graph routes.
// Modifications: extracted the label styling from the upstream text-field compound component,
// replaced registry alias imports with the local cva helper, and mapped destructive text to Manotes tokens.
export type LabelProps = ComponentProps<"label">;

export const Label = (props: LabelProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <label
      data-slot="label"
      class={cx(
        "text-sm font-medium select-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid]:text-error-fg",
        props.class,
      )}
      {...rest}
    />
  );
};
