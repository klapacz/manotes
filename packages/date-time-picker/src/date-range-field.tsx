import { Show, createUniqueId, splitProps } from "solid-js";
import type { JSX } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { FieldInput } from "./field";
import type { FieldProps } from "./field";
import { createDateRangeFieldState } from "./range-state";
import type { DateRangeFieldOptions, DateRangeFieldState } from "./range-state";
import type { DateValue } from "./types";

export interface DateRangeFieldProps<T extends DateValue = Temporal.PlainDate>
  extends
    DateRangeFieldOptions<T>,
    Pick<
      FieldProps<T>,
      | "label"
      | "description"
      | "errorMessage"
      | "id"
      | "class"
      | "autoFocus"
      | "form"
      | "segmentLabels"
    > {
  startName?: string;
  endName?: string;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangeField<T extends DateValue = Temporal.PlainDate>(
  props: DateRangeFieldProps<T>,
) {
  const state = createDateRangeFieldState(props);

  return <DateRangeFieldInput {...props} state={state} />;
}

export function DateRangeFieldInput<T extends DateValue = Temporal.PlainDate>(
  props: DateRangeFieldProps<T> & {
    state: DateRangeFieldState<T>;
    children?: JSX.Element;
    onKeyDown?: (event: KeyboardEvent) => void;
  },
) {
  const state = props.state;
  const id = props.id ?? `date-range-${createUniqueId()}`;

  const [local, shared] = splitProps(props, [
    "value",
    "defaultValue",
    "onChange",
    "validate",
    "label",
    "description",
    "errorMessage",
    "id",
    "class",
    "autoFocus",
    "startName",
    "endName",
    "startLabel",
    "endLabel",
    "state",
    "children",
    "onKeyDown",
  ]);

  const error = () => local.errorMessage ?? state.validationErrors().join(" ");

  const describedBy = () => {
    return (
      [
        local.description ? `${id}-description` : undefined,
        state.isInvalid() && error() ? `${id}-error` : undefined,
      ]
        .filter(Boolean)
        .join(" ") || undefined
    );
  };

  return (
    <fieldset
      id={id}
      class={local.class}
      disabled={props.isDisabled}
      aria-describedby={describedBy()}
      aria-invalid={state.isInvalid() || undefined}
      data-date-range=""
      data-invalid={state.isInvalid() || undefined}
      onKeyDown={(event) => local.onKeyDown?.(event)}
    >
      <legend>{local.label}</legend>
      <div data-range-inputs="">
        <div data-range-fields="">
          <FieldInput
            {...shared}
            state={state.start}
            id={`${id}-start`}
            label={local.startLabel ?? `Start ${local.label}`}
            name={local.startName}
            autoFocus={local.autoFocus}
            aria-describedby={describedBy()}
          />
          <span aria-hidden="true">–</span>
          <FieldInput
            {...shared}
            state={state.end}
            id={`${id}-end`}
            label={local.endLabel ?? `End ${local.label}`}
            name={local.endName}
            aria-describedby={describedBy()}
          />
        </div>
        {local.children}
      </div>
      <Show when={local.description}>
        <div id={`${id}-description`}>{local.description}</div>
      </Show>
      <Show when={state.isInvalid() && error()}>
        <div id={`${id}-error`} role="alert">
          {error()}
        </div>
      </Show>
    </fieldset>
  );
}
