import type { VariantProps } from "cva";
import {
  createFormHook,
  createFormHookContexts,
  revalidateLogic,
  type AnyFormApi,
} from "@tanstack/solid-form";
import type { Component, ComponentProps, ParentProps, JSX } from "solid-js";
import { splitProps, Show } from "solid-js";

import { Predicate } from "effect";
import { cva } from "../../lib/cva";
import { Button, type ButtonProps } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  TextField as TextFieldRoot,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  type TextFieldInputProps,
} from "./text-field";

export const formVariants = cva({
  base: "",
  variants: {
    spacing: {
      default: "space-y-6",
      compact: "space-y-4",
    },
  },
  defaultVariants: {
    spacing: "default",
  },
});

export type FormProps = ComponentProps<"form"> & VariantProps<typeof formVariants>;

export const Form = (props: FormProps) => {
  const [, rest] = splitProps(props, ["class", "spacing"]);

  return (
    <form
      data-slot="form"
      class={formVariants({
        spacing: props.spacing,
        class: props.class,
      })}
      {...rest}
    />
  );
};

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const appValidationLogic = revalidateLogic();

type AppTextFieldProps = {
  label: JSX.Element;
  description?: JSX.Element;
  id?: string;
} & Omit<TextFieldInputProps, "name" | "value" | "onInput" | "onBlur">;

function AppTextField(props: AppTextFieldProps) {
  const field = useFieldContext<string>();
  const messages = () => getErrorMessages(field().state.meta.errors);
  const hasErrors = () => !field().state.meta.isValid;
  const [, inputProps] = splitProps(props, ["label", "description", "id"]);

  return (
    <TextFieldRoot validationState={hasErrors() ? "invalid" : "valid"}>
      <TextFieldLabel>{props.label}</TextFieldLabel>
      <TextFieldInput
        name={field().name}
        value={field().state.value}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
        onBlur={() => field().handleBlur()}
        {...inputProps}
      />
      <Show when={props.description}>
        {(description) => <TextFieldDescription>{description()}</TextFieldDescription>}
      </Show>
      <TextFieldErrorMessage errors={messages().map((message) => ({ message }))} />
    </TextFieldRoot>
  );
}

type AppFileFieldProps = {
  label: JSX.Element;
  description?: JSX.Element;
  id?: string;
} & Omit<ComponentProps<"input">, "name" | "value" | "type" | "onChange" | "onBlur">;

function AppFileField(props: AppFileFieldProps) {
  const field = useFieldContext<File | null>();
  const messages = () => getErrorMessages(field().state.meta.errors);
  const hasErrors = () => !field().state.meta.isValid;
  const inputId = () => props.id ?? getFieldId(field().name);
  const [, inputProps] = splitProps(props, ["label", "description", "id"]);

  return (
    <div class="grid w-full gap-2" data-invalid={hasErrors() ? "" : undefined}>
      <Label for={inputId()} data-invalid={hasErrors() ? "" : undefined}>
        {props.label}
      </Label>
      <Input
        id={inputId()}
        type="file"
        name={field().name}
        onChange={(event) => field().handleChange(event.currentTarget.files?.[0] ?? null)}
        onBlur={() => field().handleBlur()}
        aria-invalid={hasErrors() || undefined}
        {...inputProps}
      />
      <Show when={props.description}>
        {(description) => <p class="text-fg-subtle text-sm">{description()}</p>}
      </Show>
      <Show when={messages().length > 0}>
        {(_) => <div class="text-error-fg text-sm">{messages().join(", ")}</div>}
      </Show>
    </div>
  );
}

type SubmitButtonProps = ButtonProps;

function SubmitButton(props: SubmitButtonProps) {
  const form = useFormContext();
  const [local, rest] = splitProps(props, ["children", "disabled"]);

  return (
    <form.Subscribe
      selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
    >
      {(state) => (
        <Button
          type="submit"
          disabled={local.disabled || state().isSubmitting || !state().canSubmit}
          {...rest}
        >
          {local.children}
        </Button>
      )}
    </form.Subscribe>
  );
}

const appFormHook = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    FileField: AppFileField,
    TextField: AppTextField,
  },
  formComponents: {
    SubmitButton,
  },
});

export const useAppForm: typeof appFormHook.useAppForm = (options) =>
  appFormHook.useAppForm(() => {
    const next = options();
    return {
      ...next,
      validationLogic: next.validationLogic ?? appValidationLogic,
    };
  });

export const withFieldGroup = appFormHook.withFieldGroup;

export type AppFormProps = FormProps & {
  form: AnyFormApi;
  AppForm: Component<ParentProps>;
};

export function AppForm(props: AppFormProps) {
  const [local, rest] = splitProps(props, ["AppForm", "children", "form"]);

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void local.form.handleSubmit().catch((error) => {
          console.error("Failed to submit form.", error);
        });
      }}
      {...rest}
    >
      <local.AppForm>{local.children}</local.AppForm>
    </Form>
  );
}

function getErrorMessages(errors: ReadonlyArray<unknown>): Array<string> {
  return errors.flatMap(getErrorMessagesFromValue);
}

function getErrorMessagesFromValue(value: unknown): Array<string> {
  if (Array.isArray(value)) return value.flatMap(getErrorMessagesFromValue);
  if (Predicate.isString(value)) return [value];
  if (
    Predicate.isObject(value) &&
    Predicate.hasProperty(value, "message") &&
    Predicate.isString(value.message)
  ) {
    return [value.message];
  }

  return [];
}

function getFieldId(name: string) {
  return `field-${name.replaceAll(/[^a-zA-Z0-9_-]+/g, "-")}`;
}
