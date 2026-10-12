import { Index, Show, createEffect, createUniqueId, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Intl as TemporalIntl, Temporal } from "temporal-polyfill";
import { createDateFieldState, createTimeFieldState } from "./state";
import { isRTL } from "./locale";
import type {
  DateFieldState,
  DateSegment,
  DateValue,
  FieldOptions,
  FieldValue,
  TimeValue,
} from "./types";

export interface FieldProps<T extends FieldValue> extends FieldOptions<T> {
  label: string;
  description?: string;
  errorMessage?: string;
  name?: string;
  form?: string;
  id?: string;
  class?: string;
  autoFocus?: boolean;
  /** Override segment labels for assistive technology. */
  segmentLabels?: Partial<Record<DateSegment["type"], string>>;
  children?: JSX.Element;
}

export function DateField<T extends DateValue = Temporal.PlainDate>(props: FieldProps<T>) {
  const state = createDateFieldState(props);

  return <FieldInput state={state} {...props} />;
}

export function TimeField<T extends TimeValue = Temporal.PlainTime>(props: FieldProps<T>) {
  const state = createTimeFieldState(props);

  return <FieldInput state={state} {...props} />;
}

export function FieldInput<T extends FieldValue>(
  props: FieldProps<T> & { state: DateFieldState<T>; onKeyDown?: (event: KeyboardEvent) => void },
) {
  const id = props.id ?? `date-field-${createUniqueId()}`;
  let root!: HTMLDivElement;
  let input!: HTMLInputElement;
  const state = props.state;
  const error = () => props.errorMessage ?? state.validationErrors().join(" ");

  const describedBy = () => {
    return (
      [
        props.description ? `${id}-description` : undefined,
        state.isInvalid() && error() ? `${id}-error` : undefined,
      ]
        .filter(Boolean)
        .join(" ") || undefined
    );
  };

  const editableElements = () => {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-segment][tabindex='0']"));
  };

  const focus = () => editableElements()[0]?.focus();

  onMount(() => {
    const form = input.form;
    const reset = () => state.reset();
    form?.addEventListener("reset", reset);
    onCleanup(() => form?.removeEventListener("reset", reset));

    if (props.autoFocus) focus();
  });

  function focusRelative(element: HTMLElement, delta: number) {
    const elements = editableElements();
    elements[elements.indexOf(element) + delta]?.focus();
  }

  return (
    <div
      class={props.class}
      id={id}
      data-invalid={state.isInvalid() || undefined}
      data-disabled={state.isDisabled() || undefined}
    >
      <span id={`${id}-label`} onClick={focus}>
        {props.label}
      </span>
      <div
        ref={(element) => {
          root = element;
        }}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={describedBy()}
        aria-invalid={state.isInvalid() || undefined}
        aria-disabled={state.isDisabled() || undefined}
        aria-readonly={state.isReadOnly() || undefined}
        data-date-input=""
        onKeyDown={(event) => props.onKeyDown?.(event)}
      >
        <Index each={state.segments()}>
          {(segment) => (
            <DateSegmentInput
              segment={segment()}
              state={state}
              label={props.segmentLabels?.[segment().type] ?? segment().type}
              fieldLabel={props.label}
              labelledBy={`${id}-label`}
              describedBy={describedBy()}
              locale={props.locale ?? "en-US"}
              focusRelative={focusRelative}
            />
          )}
        </Index>
        {props.children}
      </div>
      <input
        ref={(element) => {
          input = element;
        }}
        type="hidden"
        name={props.name}
        form={props.form}
        value={state.value()?.toString() ?? ""}
        disabled={state.isDisabled()}
      />
      <Show when={props.description}>
        <div id={`${id}-description`}>{props.description}</div>
      </Show>
      <Show when={state.isInvalid() && error()}>
        <div id={`${id}-error`} role="alert">
          {error()}
        </div>
      </Show>
    </div>
  );
}

function DateSegmentInput<T extends FieldValue>(props: {
  segment: DateSegment;
  state: DateFieldState<T>;
  label: string;
  fieldLabel: string;
  labelledBy: string;
  describedBy?: string;
  locale: string;
  focusRelative: (element: HTMLElement, delta: number) => void;
}) {
  let element!: HTMLSpanElement;
  let enteredKeys = "";
  const segment = () => props.segment;
  const state = props.state;
  const editable = () => segment().isEditable && !state.isDisabled() && !state.isReadOnly();
  const focusable = () => segment().isEditable || segment().type === "timeZoneName";
  const labelId = `segment-label-${createUniqueId()}`;
  const rtl = () => isRTL(props.locale);

  // Keep nodes stable while the state replaces its segment descriptors.
  createEffect(() => {
    element.textContent = segment().text;
  });

  function typeText(text: string) {
    if (!editable()) return;

    if (segment().type === "dayPeriod") {
      const formatter = new TemporalIntl.DateTimeFormat(props.locale, {
        hour: "numeric",
        hourCycle: "h12",
      });

      for (const [period, hour] of [
        [0, 0],
        [1, 13],
      ] as const) {
        const date = new Temporal.PlainTime(hour);
        const name = formatter.formatToParts(date).find((part) => part.type === "dayPeriod")?.value;

        if (
          name?.toLocaleLowerCase(props.locale).startsWith(text.toLocaleLowerCase(props.locale))
        ) {
          state.setSegment("dayPeriod", period);
          props.focusRelative(element, 1);
          break;
        }
      }

      return;
    }

    const digits = parseDigits(text, props.locale);

    if (digits === undefined) return;
    let candidate = enteredKeys + digits;
    const max = segment().maxValue ?? 0;

    if (Number(candidate) > max) candidate = digits;
    const number = Number(candidate);

    if (number > max) return;
    enteredKeys = candidate;
    const min = segment().minValue ?? 0;

    if (number >= min) state.setSegment(segment().type, number);

    if (number >= min && (number * 10 > max || candidate.length >= String(max).length)) {
      enteredKeys = "";
      props.focusRelative(element, 1);
    }
  }

  // Port of React Aria useDateSegment.backspace; shared with the mobile beforeinput path.
  function backspace() {
    if (!editable()) return;

    if (segment().isPlaceholder) {
      props.focusRelative(element, -1);

      return;
    }

    const digits = parseDigits(segment().text, props.locale);
    const remaining = digits?.slice(0, -1) ?? "";

    if (!remaining || Number(remaining) === 0) {
      state.clearSegment(segment().type);
      enteredKeys = "";
    } else {
      state.setSegment(segment().type, Number(remaining));
      enteredKeys = remaining;
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const type = segment().type;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      props.focusRelative(element, (event.key === "ArrowRight" ? 1 : -1) * (rtl() ? -1 : 1));

      return;
    }

    if (!editable()) return;

    switch (event.key) {
      case "ArrowUp":
        state.increment(type);
        break;
      case "ArrowDown":
        state.decrement(type);
        break;
      case "PageUp":
        state.incrementPage(type);
        break;
      case "PageDown":
        state.incrementPage(type, -1);
        break;
      case "Home":
        state.setSegmentToLimit(type, "min");
        break;
      case "End":
        state.setSegmentToLimit(type, "max");
        break;
      case "Backspace":
      case "Delete":
        backspace();
        event.preventDefault();

        return;
      default:
        if (event.key.length !== 1) return;
        typeText(event.key);
        event.preventDefault();

        return;
    }

    enteredKeys = "";
    event.preventDefault();
  }

  return (
    <>
      <Show when={focusable()}>
        <span id={labelId} hidden>
          {props.label}
        </span>
      </Show>
      <span
        ref={(node) => {
          element = node;
        }}
        role={
          segment().isEditable
            ? "spinbutton"
            : segment().type === "timeZoneName"
              ? "textbox"
              : undefined
        }
        tabIndex={focusable() && !state.isDisabled() ? 0 : undefined}
        contentEditable={editable()}
        inputMode={segment().type === "dayPeriod" ? "text" : "numeric"}
        aria-label={focusable() ? `${props.label}, ${props.fieldLabel}` : undefined}
        aria-labelledby={focusable() ? `${labelId} ${props.labelledBy}` : undefined}
        aria-describedby={focusable() ? props.describedBy : undefined}
        aria-hidden={segment().type === "literal" || undefined}
        aria-valuenow={segment().value}
        aria-valuemin={segment().minValue}
        aria-valuemax={segment().maxValue}
        aria-valuetext={segment().isPlaceholder ? "Empty" : segment().text}
        aria-invalid={state.isInvalid() || undefined}
        aria-required={state.isRequired() || undefined}
        aria-readonly={state.isReadOnly() || segment().type === "timeZoneName" || undefined}
        aria-disabled={state.isDisabled() || undefined}
        data-segment={focusable() ? segment().type : undefined}
        data-type={segment().type}
        data-placeholder={segment().isPlaceholder || undefined}
        spellcheck={false}
        style={{ "caret-color": "transparent" }}
        onFocus={() => {
          enteredKeys = "";

          if (editable()) element.ownerDocument.getSelection()?.collapse(element, 0);
        }}
        onKeyDown={onKeyDown}
        onBeforeInput={(event) => {
          if (event.inputType === "insertCompositionText") return;
          event.preventDefault();

          if (event.inputType.startsWith("delete")) {
            backspace();
          } else if (event.data) typeText(event.data);
        }}
        onInput={(event) => {
          if (event.inputType === "insertCompositionText" && event.data) typeText(event.data);
          element.textContent = segment().text;
        }}
        onPaste={(event) => {
          event.preventDefault();
          typeText(event.clipboardData?.getData("text") ?? "");
        }}
      />
    </>
  );
}

function parseDigits(text: string, locale: string): string | undefined {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  let result = "";

  for (const character of text) {
    const digit = Array.from({ length: 10 }, (_, n) => formatter.format(n)).indexOf(character);

    if (digit >= 0) result += digit;
    else if (/^[0-9]$/.test(character)) result += character;
    else return undefined;
  }

  return result || undefined;
}
