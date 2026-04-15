import { TextField as TextFieldPrimitive } from "@kobalte/core/text-field";
import { For, Match, Switch, splitProps } from "solid-js";
import type { ComponentProps, ValidComponent } from "solid-js";

import { cx } from "../../lib/cva";

// Adapted from shadcn-solid (commit 4c75b89, using @kobalte/core 0.13.11 / solid-js 1.9.10).
// Source: apps/docs/src/registry/ui/text-field.tsx
// Why: route forms should use Kobalte's text field primitive so labels, descriptions, and invalid state stay coupled semantically.
// Modifications: replaced registry alias imports with the local cva helper and mapped styles to Manotes design tokens.
export type TextFieldProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TextFieldPrimitive<T>
>;

export const TextField = <T extends ValidComponent = "div">(props: TextFieldProps<T>) => {
  const [, rest] = splitProps(props as TextFieldProps, ["class"]);

  return (
    <TextFieldPrimitive
      data-slot="text-field"
      class={cx("grid w-full gap-2", props.class)}
      {...rest}
    />
  );
};

export type TextFieldInputProps<T extends ValidComponent = "input"> = ComponentProps<
  typeof TextFieldPrimitive.Input<T>
>;

export const TextFieldInput = <T extends ValidComponent = "input">(
  props: TextFieldInputProps<T>,
) => {
  const [, rest] = splitProps(props as TextFieldInputProps, ["class"]);

  return (
    <TextFieldPrimitive.Input
      data-slot="text-field-input"
      class={cx(
        "border-border placeholder:text-fg-subtle selection:bg-primary-solid selection:text-primary-fg-solid flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px] aria-[invalid]:border-error-border aria-[invalid]:ring-error-border/30",
        props.class,
      )}
      {...rest}
    />
  );
};

export type TextFieldTextAreaProps<T extends ValidComponent = "textarea"> = ComponentProps<
  typeof TextFieldPrimitive.TextArea<T>
>;

export const TextFieldTextArea = <T extends ValidComponent = "textarea">(
  props: TextFieldTextAreaProps<T>,
) => {
  const [, rest] = splitProps(props as TextFieldTextAreaProps, ["class"]);

  return (
    <TextFieldPrimitive.TextArea
      data-slot="text-field-textarea"
      class={cx(
        "border-border placeholder:text-fg-subtle selection:bg-primary-solid selection:text-primary-fg-solid flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-primary-border focus-visible:ring-primary-border/30 focus-visible:ring-[3px] aria-[invalid]:border-error-border aria-[invalid]:ring-error-border/30",
        props.class,
      )}
      {...rest}
    />
  );
};

export type TextFieldLabelProps<T extends ValidComponent = "label"> = ComponentProps<
  typeof TextFieldPrimitive.Label<T>
>;

export const TextFieldLabel = <T extends ValidComponent = "label">(
  props: TextFieldLabelProps<T>,
) => {
  const [, rest] = splitProps(props as TextFieldLabelProps, ["class"]);

  return (
    <TextFieldPrimitive.Label
      data-slot="text-field-label"
      class={cx(
        "text-sm font-medium select-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid]:text-error-fg",
        props.class,
      )}
      {...rest}
    />
  );
};

export type TextFieldErrorMessageProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TextFieldPrimitive.ErrorMessage<T>
> & {
  errors?: ({ message?: string } | undefined)[];
};

export const TextFieldErrorMessage = <T extends ValidComponent = "div">(
  props: TextFieldErrorMessageProps<T>,
) => {
  const [, rest] = splitProps(props as TextFieldErrorMessageProps, ["class", "errors", "children"]);

  const uniqueErrors = () => [
    ...new Map(props.errors?.map((error) => [error?.message, error])).values(),
  ];

  return (
    <TextFieldPrimitive.ErrorMessage
      data-slot="text-field-error-message"
      class={cx("text-error-fg text-sm", props.class)}
      {...rest}
    >
      <Switch
        fallback={
          <ul class="ml-4 flex list-disc flex-col gap-1">
            <For each={uniqueErrors()}>{(error) => <li>{error?.message}</li>}</For>
          </ul>
        }
      >
        <Match when={props.children}>{props.children}</Match>
        <Match when={!props.errors?.length}>{null}</Match>
        <Match when={uniqueErrors().length === 1}>{uniqueErrors()[0]?.message}</Match>
      </Switch>
    </TextFieldPrimitive.ErrorMessage>
  );
};

export type TextFieldDescriptionProps<T extends ValidComponent = "div"> = ComponentProps<
  typeof TextFieldPrimitive.Description<T>
>;

export const TextFieldDescription = <T extends ValidComponent = "div">(
  props: TextFieldDescriptionProps<T>,
) => {
  const [, rest] = splitProps(props as TextFieldDescriptionProps, ["class"]);

  return (
    <TextFieldPrimitive.Description
      data-slot="text-field-description"
      class={cx("text-fg-subtle text-sm", props.class)}
      {...rest}
    />
  );
};
