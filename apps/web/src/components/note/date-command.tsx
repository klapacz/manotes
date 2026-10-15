import { createEffect, on, Show, type JSX } from "solid-js";
import { Temporal } from "temporal-polyfill";
import {
  CalendarView,
  FieldInput,
  createCalendarState,
  createDateFieldState,
} from "@manotes/date-time-picker";
import { QueryEngine } from "../../lib/query-engine";
import { DateSuggestions } from "../../lib/date-suggestions";
import { CommandList, CommandScroll } from "../ui/command";
import { Button } from "../ui/button";
import { ApplyIcon } from "../icons";
import { Picker } from "../ui/picker";

export function Root(props: {
  label: string;
  value: string | undefined;
  initialSearch?: string;
  onChange: (date: string) => void;
  onBack: () => void;
  onClear: (() => void) | undefined;
}) {
  const query = QueryEngine.map(DateSuggestions.query, (date) => ({
    value: date.id,
    label: date.title,
  }));

  return (
    <Picker.Query
      query={query}
      label={props.label}
      placeholder='Try "next Friday" or a date…'
      initialSearch={props.initialSearch}
      selected={props.value}
      onSelect={(date) => props.onChange(date.value)}
    >
      {(items) => (
        <CommandList
          style={{
            // Fit suggestions and the calendar; cap height on short screens.
            "--command-list-height": "min(36rem,70dvh)",
          }}
        >
          <CommandScroll>
            <DateEditor value={props.value} onChange={props.onChange} suggestions={items} />
          </CommandScroll>
          <Picker.Footer>
            {/* Let Tab reach Back from the date controls as well as command navigation. */}
            <Picker.Back tabIndex={0} onSelect={props.onBack} />
            <Show when={props.onClear}>
              <Picker.Clear onSelect={props.onClear} />
            </Show>
          </Picker.Footer>
        </CommandList>
      )}
    </Picker.Query>
  );
}

function DateEditor(props: {
  value: string | undefined;
  onChange: (date: string) => void;
  suggestions: JSX.Element;
}) {
  const field = createDateFieldState({
    defaultValue: props.value ? Temporal.PlainDate.from(props.value) : null,
  });

  const calendar = createCalendarState({
    get value() {
      return field.value();
    },
    onChange: (date) => props.onChange(date.toString()),
  });

  createEffect(
    on(field.value, (date) => {
      if (date) calendar.focusDate(date);
    }),
  );

  const isDirty = () => {
    const value = field.value();

    if (value) return value.toString() !== props.value;

    return (
      !!props.value ||
      field.segments().some((segment) => segment.isEditable && !segment.isPlaceholder)
    );
  };

  const apply = () => {
    const date = field.value();

    if (date && !field.isInvalid()) props.onChange(date.toString());
  };

  return (
    <div class="date-command">
      <div class="py-1">{props.suggestions}</div>
      <div
        class="date-command-editor"
        onKeyDown={(event) => {
          // Segment keys must not also select or navigate command suggestions.
          if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
        }}
      >
        <div class="-mx-1 flex min-h-9 items-center gap-2 border-y border-border px-3">
          <FieldInput
            state={field}
            label="Date"
            class="
              min-w-0 flex-1 text-sm
              [&>span]:sr-only
              [&_[data-date-input]]:flex
              [&_[data-date-input]]:min-h-9
              [&_[data-date-input]]:items-center
              [&_[data-date-input]]:bg-transparent
              [&_[data-date-input]]:tabular-nums
              [&_[data-segment]]:rounded-[3px]
              [&_[data-segment]]:px-0.5
              [&_[data-segment]]:py-px
              [&_[data-segment]]:outline-none
              [&_[data-placeholder]]:text-fg-subtle
              [&_[data-segment]:focus]:bg-primary-solid
              [&_[data-segment]:focus]:text-primary-fg-solid
              [&_[role=alert]]:mt-1
              [&_[role=alert]]:text-xs
              [&_[role=alert]]:text-error-fg
            "
          />
          <Show when={isDirty()}>
            <span role="status" class="shrink-0 text-xs text-fg-subtle">
              Not applied
            </span>
          </Show>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Apply date"
            title="Apply date"
            disabled={!field.value() || field.isInvalid()}
            onClick={apply}
          >
            <ApplyIcon />
          </Button>
        </div>
      </div>
      <div
        class="px-2 pt-3 pb-2"
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
        }}
      >
        <CalendarView
          state={calendar}
          label="Choose date"
          class="
            mx-auto w-full max-w-66 text-sm
            [&_header]:mb-2
            [&_header]:flex
            [&_header]:items-center
            [&_header]:justify-between
            [&_header]:font-semibold
            [&_header_button]:grid
            [&_header_button]:size-7
            [&_header_button]:place-items-center
            [&_header_button]:rounded-[6px]
            [&_header_button]:border
            [&_header_button]:border-border
            [&_header_svg]:size-4
            [&_table]:w-full
            [&_table]:table-fixed
            [&_table]:border-collapse
            [&_table]:border-spacing-0
            [&_th]:h-7
            [&_th]:text-xs
            [&_th]:font-normal
            [&_th]:text-fg-subtle
            [&_td]:px-0
            [&_td]:py-px
            [&_td]:text-center
            [&_td_button]:h-7.5
            [&_td_button]:w-8
            [&_td_button]:rounded-[6px]
            [&_td_button]:tabular-nums
            [&_button:hover]:bg-control-hover
            [&_button[data-outside-month]]:text-fg-subtle
            [&_button[data-selected]]:bg-primary-solid
            [&_button[data-selected]]:text-primary-fg-solid
            [&_button[data-selected]:hover]:bg-primary-solid-hover
            [&_button:focus-visible]:outline-2
            [&_button:focus-visible]:outline-offset-1
            [&_button:focus-visible]:outline-primary-border-hover
          "
        />
      </div>
    </div>
  );
}

export * as DateCommand from "./date-command";
