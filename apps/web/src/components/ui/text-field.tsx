import type { StyledProps } from "../../lib/cva";
import { For, Show, omit } from "solid-js";
import { Field, FieldLabel, FieldDescription, FieldError } from "@ui-sdk/solid/field";
import { Input } from "@ui-sdk/solid/input";
import { Textarea } from "@ui-sdk/solid/textarea";
import { cx } from "../../lib/cva";
import { inputClass } from "./input";

export type TextFieldProps = StyledProps<typeof Field> & {
  validationState?: "valid" | "invalid";
};

export function TextField(props: TextFieldProps) {
  return (
    <Field
      {...omit(props, "class", "validationState")}
      invalid={props.validationState === "invalid"}
      class={cx("grid w-full gap-2", props.class)}
    />
  );
}

export type TextFieldInputProps = StyledProps<typeof Input>;

export function TextFieldInput(props: TextFieldInputProps) {
  return <Input {...omit(props, "class")} class={cx(inputClass, props.class)} />;
}

export function TextFieldTextArea(props: StyledProps<typeof Textarea>) {
  return <Textarea {...omit(props, "class")} class={cx(inputClass, "min-h-16", props.class)} />;
}

export function TextFieldLabel(props: StyledProps<typeof FieldLabel>) {
  return (
    <FieldLabel
      {...omit(props, "class")}
      class={cx(
        "text-sm font-medium select-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid]:text-error-fg",
        props.class,
      )}
    />
  );
}

export function TextFieldDescription(props: StyledProps<typeof FieldDescription>) {
  return (
    <FieldDescription {...omit(props, "class")} class={cx("text-fg-subtle text-sm", props.class)} />
  );
}

export function TextFieldErrorMessage(
  props: StyledProps<typeof FieldError> & { errors?: ({ message?: string } | undefined)[] },
) {
  const unique = () => [...new Set(props.errors?.map((e) => e?.message).filter(Boolean))];

  return (
    <FieldError
      {...omit(props, "class", "errors", "children")}
      class={cx("text-error-fg text-sm", props.class)}
    >
      <Show
        when={props.children}
        fallback={
          <Show
            when={unique().length === 1}
            fallback={
              <ul class="ml-4 flex list-disc flex-col gap-1">
                <For each={unique()}>{(message) => <li>{message}</li>}</For>
              </ul>
            }
          >
            {unique()[0]}
          </Show>
        }
      >
        {props.children}
      </Show>
    </FieldError>
  );
}
