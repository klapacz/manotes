import { batch, createMemo, createSignal, mergeProps, splitProps } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { compare, createDateFieldState } from "./state";
import type { DateValue, FieldOptions } from "./types";

export interface DateRange<T extends DateValue = Temporal.PlainDate> {
  start: T;
  end: T;
}

export interface DateRangeFieldOptions<T extends DateValue = Temporal.PlainDate> extends Omit<
  FieldOptions<T>,
  "value" | "defaultValue" | "onChange" | "validate"
> {
  value?: DateRange<T> | null;
  defaultValue?: DateRange<T> | null;
  onChange?: (value: DateRange<T> | null) => void;
  validate?: (value: DateRange<T>) => string | undefined;
}

export type DateRangeFieldState<T extends DateValue = Temporal.PlainDate> = ReturnType<
  typeof createDateRangeFieldState<T>
>;

/**
 * Adapted from React Stately 3.51.0, useDateRangePickerState.ts and
 * datepicker/utils.ts@getRangeValidationResult, commit 821c011ce99032415278d88fba0f51f3fb5e5efe.
 * Keeps incomplete endpoints locally and emits complete ranges or null.
 * Changes: Solid accessors and Temporal comparisons; existing field states handle segments.
 */
export function createDateRangeFieldState<T extends DateValue = Temporal.PlainDate>(
  props: DateRangeFieldOptions<T>,
) {
  const initial = props.defaultValue ?? null;
  const seed = props.value !== undefined ? props.value : initial;

  const [, fieldOptions] = splitProps(props, [
    "value",
    "defaultValue",
    "onChange",
    "validate",
    "placeholderValue",
  ]);

  const [internalValue, setInternalValue] = createSignal<DateRange<T> | null>(initial);
  const value = () => (props.value !== undefined ? props.value : internalValue());

  const [draft, setDraft] = createSignal<{ start: T | null; end: T | null }>(
    seed ?? { start: null, end: null },
  );

  const [source, setSource] = createSignal(value());
  let resetting = false;

  const endpoints = createMemo(() => {
    if (source() !== value()) {
      batch(() => {
        setSource(value());
        setDraft(value() ?? { start: null, end: null });
      });
    }

    return value() ?? draft();
  });

  const startField = createDateFieldState<T>(
    mergeProps(fieldOptions, {
      get value() {
        return endpoints().start;
      },
      defaultValue: initial?.start ?? null,
      get placeholderValue() {
        return props.placeholderValue ?? seed?.start;
      },
      onChange: (next: T | null) => setEndpoint("start", next),
    }),
  );

  const endField = createDateFieldState<T>(
    mergeProps(fieldOptions, {
      get value() {
        return endpoints().end;
      },
      defaultValue: initial?.end ?? null,
      get placeholderValue() {
        return props.placeholderValue ?? seed?.end;
      },
      onChange: (next: T | null) => setEndpoint("end", next),
    }),
  );

  const validationErrors = createMemo(() => {
    const errors = new Set([...startField.validationErrors(), ...endField.validationErrors()]);
    const current = value();

    if (current) {
      if (compare(current.end, current.start, "date") < 0) {
        errors.add("End date must be on or after start date.");
      }

      const error = props.validate?.(current);

      if (error) errors.add(error);
    }

    return Array.from(errors);
  });

  const isInvalid = () => !!props.isInvalid || validationErrors().length > 0;

  function emit(next: DateRange<T> | null) {
    const current = value();

    if (
      current === next ||
      (current &&
        next &&
        current.start.toString() === next.start.toString() &&
        current.end.toString() === next.end.toString())
    ) {
      return;
    }

    if (props.value === undefined) setInternalValue(next);
    props.onChange?.(next);

    if (props.value === null && next) replace(null);
    setSource(value());
  }

  function setEndpoint(part: "start" | "end", next: T | null) {
    if (resetting) return;
    batch(() => {
      const changed = { ...endpoints(), [part]: next };
      setDraft(changed);
      emit(changed.start && changed.end ? { start: changed.start, end: changed.end } : null);
    });
  }

  function replace(next: DateRange<T> | null) {
    batch(() => {
      resetting = true;
      startField.reset();
      endField.reset();
      resetting = false;
      setDraft(next ?? { start: null, end: null });
      emit(next);
    });
  }

  const reset = () => replace(initial);

  return {
    value,
    validationErrors,
    isInvalid,
    // The range renders one shared error; both endpoint groups still announce invalid state.
    start: { ...startField, isInvalid, validationErrors: () => [], reset },
    end: { ...endField, isInvalid, validationErrors: () => [], reset },
    setValue: (next: DateRange<T> | null) => {
      if (!props.isDisabled && !props.isReadOnly) replace(next);
    },
    reset,
  };
}
