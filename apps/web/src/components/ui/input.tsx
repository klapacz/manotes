import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/text-field.tsx
// Why: this app was missing a shared input primitive for pre-graph routes and dialogs.
// Modifications: extracted a standalone input wrapper from the upstream text-field input styles,
// swapped registry alias imports for the local cva helper, and mapped styles to Manotes tokens.
export const inputClass =
  "border-border placeholder:text-fg-subtle selection:bg-primary-solid selection:text-primary-fg-solid flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 file:text-fg file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px] aria-[invalid]:border-error-border aria-[invalid]:ring-error-border/30";

export type InputProps = ComponentProps<"input">;

export const Input = (props: InputProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return <input data-slot="input" class={cx(inputClass, props.class)} {...rest} />;
};
