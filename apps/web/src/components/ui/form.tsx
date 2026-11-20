import type { ComponentProps, JSX } from "@solidjs/web";
import type { VariantProps } from "cva";
import {
  createFormHook,
  getFormHookHelpers,
  createValidator,
  type FieldWithValue,
  type AnyFormApi,
} from "@tanstack/solid-form";
import type { Component, ParentProps } from "solid-js";
import { omit, Show } from "solid-js";

import { Predicate, type Types } from "effect";
import { cva } from "../../lib/cva";
import { Button, type ButtonProps } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  TextField,
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
  const rest = omit(props, "class", "spacing");

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

export const afterSubmit = createValidator({
  triggers: [{ trigger: "change", when: ({ formApi }) => formApi.state.submissionAttempts > 0 }],
});

type AppTextFieldProps = Types.MergeRight<
  Omit<TextFieldInputProps, "name" | "value" | "onValueChange" | "onInput" | "onBlur">,
  {
    field: () => FieldWithValue<string>;
    label: JSX.Element;
    description?: JSX.Element;
    id?: string;
  }
>;

function AppTextField(props: AppTextFieldProps) {
  const field = props.field;
  const messages = () => getErrorMessages(field().errors);
  const hasErrors = () => field().meta.isInvalid;
  const inputProps = omit(props, "field", "label", "description", "id");

  return (
    <TextField validationState={hasErrors() ? "invalid" : "valid"}>
      <TextFieldLabel>{props.label}</TextFieldLabel>
      <TextFieldInput
        name={field().name}
        value={field().value}
        onValueChange={(value) => field().handleChange(value)}
        onBlur={() => field().handleBlur()}
        {...inputProps}
      />
      <Show when={props.description}>
        {(description) => <TextFieldDescription>{description()}</TextFieldDescription>}
      </Show>
      <TextFieldErrorMessage errors={messages().map((message) => ({ message }))} />
    </TextField>
  );
}

type AppFileFieldProps = Types.MergeRight<
  Omit<ComponentProps<"input">, "name" | "value" | "type" | "onChange" | "onBlur">,
  {
    field: () => FieldWithValue<File | null>;
    label: JSX.Element;
    description?: JSX.Element;
    id?: string;
  }
>;

function AppFileField(props: AppFileFieldProps) {
  const field = props.field;
  const messages = () => getErrorMessages(field().errors);
  const hasErrors = () => field().meta.isInvalid;
  const inputId = () => props.id ?? getFieldId(field().name);
  const inputProps = omit(props, "field", "label", "description", "id");

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
        aria-invalid={hasErrors() ? "true" : "false"}
        {...inputProps}
      />
      <Show when={props.description}>
        {(description) => <p class="text-fg-subtle text-sm">{description()}</p>}
      </Show>
      <Show when={messages().length > 0}>
        <div class="text-error-fg text-sm">{messages().join(", ")}</div>
      </Show>
    </div>
  );
}

type SubmitButtonProps = ButtonProps;

function SubmitButton(props: SubmitButtonProps) {
  const form = useFormContext();
  const local = props;
  const rest = omit(props, "children", "disabled");

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

const { fieldComponent } = getFormHookHelpers();

export const { useAppForm, useFormContext } = createFormHook({
  fieldComponents: {
    FileField: fieldComponent.strict(AppFileField, "field"),
    TextField: fieldComponent.strict(AppTextField, "field"),
  },
  formComponents: { SubmitButton },
});

export type AppFormProps = FormProps & {
  form: AnyFormApi;
  AppForm: Component<ParentProps>;
  submit?: AnyFormApi["handleSubmit"];
};

export function AppForm(props: AppFormProps) {
  const local = props;
  const rest = omit(props, "AppForm", "children", "form", "submit");

  return (
    <Form
      novalidate
      onSubmit={(event) => {
        event.preventDefault();
        void (local.submit ? local.submit() : local.form.handleSubmit()).catch((error) => {
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

// eslint-disable-next-line anti-slop/no-unknown-parameters -- TanStack errors may be strings, message objects, or nested arrays.
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
