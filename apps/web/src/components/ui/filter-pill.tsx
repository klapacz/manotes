import { Show, splitProps, type JSX, type ValidComponent } from "solid-js";
import { cx } from "../../lib/cva";
import { XIcon } from "../icons";
import { Button, type ButtonProps } from "./button";
import { ButtonGroup } from "./button-group";

export function Root(props: {
  label: string;
  operator?: string;
  onClear: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <ButtonGroup.Root
      aria-label={`${props.label} filter`}
      class="h-7 shrink-0 items-center divide-x divide-border-subtle rounded-full border border-border-subtle bg-bg text-sm shadow-xs"
    >
      <span class="max-w-40 truncate px-2" title={props.label}>
        {props.label}
      </span>
      <Show when={props.operator}>
        <span class="px-2 text-sm text-fg-subtle">{props.operator}</span>
      </Show>
      {props.children}
      <Action aria-label={`Clear ${props.label} filter`} onClick={props.onClear}>
        <XIcon />
      </Action>
    </ButtonGroup.Root>
  );
}

export function Value(props: ButtonProps): JSX.Element {
  const [, rest] = splitProps(props, ["class", "children"]);

  return (
    <Button variant="ghost" size="xs" {...rest} class={cx("h-full min-w-0 max-w-48", props.class)}>
      <span class="min-w-0 truncate">{props.children}</span>
    </Button>
  );
}

export function Action<T extends ValidComponent = "button">(props: ButtonProps<T>): JSX.Element {
  return (
    <Button<T>
      variant="ghost"
      size="icon-xs"
      rounded="full"
      {...props}
      class={cx("h-full text-fg-subtle", props.class)}
    />
  );
}

export * as FilterPill from "./filter-pill";
