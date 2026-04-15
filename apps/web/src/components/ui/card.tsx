import type { ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/card.tsx
// Why: pre-graph routes needed a shared surface component instead of repeated ad hoc bordered boxes.
// Modifications: replaced registry alias imports with the local cva helper and mapped colors/borders to Manotes tokens.
export type CardProps = ComponentProps<"div">;

export const Card = (props: CardProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="card"
      class={cx(
        "bg-bg-subtle text-fg flex flex-col gap-6 rounded-xl border border-border-subtle py-6 shadow-xs",
        props.class,
      )}
      {...rest}
    />
  );
};

export type CardHeaderProps = ComponentProps<"div">;

export const CardHeader = (props: CardHeaderProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="card-header"
      class={cx(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        props.class,
      )}
      {...rest}
    />
  );
};

export type CardTitleProps = ComponentProps<"div">;

export const CardTitle = (props: CardTitleProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="card-title" class={cx("leading-none font-semibold", props.class)} {...rest} />
  );
};

export type CardDescriptionProps = ComponentProps<"div">;

export const CardDescription = (props: CardDescriptionProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="card-description" class={cx("text-fg-subtle text-sm", props.class)} {...rest} />
  );
};

export type CardActionProps = ComponentProps<"div">;

export const CardAction = (props: CardActionProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="card-action"
      class={cx("col-start-2 row-span-2 row-start-1 self-start justify-self-end", props.class)}
      {...rest}
    />
  );
};

export type CardContentProps = ComponentProps<"div">;

export const CardContent = (props: CardContentProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return <div data-slot="card-content" class={cx("px-6", props.class)} {...rest} />;
};

export type CardFooterProps = ComponentProps<"div">;

export const CardFooter = (props: CardFooterProps) => {
  const [, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="card-footer"
      class={cx("flex items-center px-6 [.border-t]:pt-6", props.class)}
      {...rest}
    />
  );
};
