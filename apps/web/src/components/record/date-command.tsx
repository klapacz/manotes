import { createEffect, createSignal, Show, For } from "solid-js";
import { Field } from "@ui-sdk/solid/field";
import type { JSX } from "@solidjs/web";
import { DateInput, DateInputSegment } from "@ui-sdk/solid/date-input";
import {
  Calendar,
  CalendarHeading,
  CalendarPrevious,
  CalendarNext,
  CalendarGrid,
  CalendarDay,
  CalendarWeekdays,
  CalendarWeekday,
  CalendarWeeks,
  createCalendarController,
} from "@ui-sdk/solid/calendar";
import { Temporal } from "temporal-polyfill";
import { Check, ChevronLeft, ChevronRight } from "@lucide/solid";
import { Button } from "../ui/button";

import { QueryEngine } from "../../lib/query-engine";
import { DateSuggestions } from "../../lib/date-suggestions";
import { CommandList, CommandScroll } from "../ui/command";
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

function normalizeDate(value: string | undefined) {
  return value ? Temporal.PlainDate.from(value).toString() : null;
}

function DateEditor(props: {
  value: string | undefined;
  onChange: (value: string) => void;
  suggestions?: JSX.Element;
}) {
  const [draft, setDraft] = createSignal(normalizeDate(props.value));
  const [touched, setTouched] = createSignal(false);
  const calendar = createCalendarController();

  createEffect(draft, (date) => {
    if (date) calendar.setMonth(date.slice(0, 7));
  });
  const dirty = () => draft() !== normalizeDate(props.value) || (!draft() && touched());

  const apply = () => {
    const date = draft();

    if (date) props.onChange(date);
  };

  return (
    <div class="date-command">
      <div class="py-1">{props.suggestions}</div>
      <div
        class="date-command-editor"
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();

          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
        }}
      >
        <div class="-mx-1 flex min-h-9 items-center gap-2 border-y border-border px-3 has-[[aria-invalid=true]]:border-error-border has-[[aria-invalid=true]]:bg-error-bg">
          <Field invalid={!draft() && dirty()} class="min-w-0 flex-1">
            <DateInput
              aria-label="Date"
              value={draft()}
              onValueChange={(value) => {
                setTouched(true);
                setDraft(value);
              }}
              onInput={() => setTouched(true)}
              locale="en-US"
              class="group/date flex min-h-9 min-w-0 flex-1 items-center bg-transparent text-sm tabular-nums data-[invalid]:text-error-fg"
            >
              {(state) => (
                <For each={state.segments} keyed={(segment) => segment.key}>
                  {(segment) => (
                    <DateInputSegment
                      segment={segment()}
                      class="w-auto rounded-[3px] bg-transparent px-0.5 py-px outline-none [&:is(input)]:w-[calc(2ch+4px)] data-[type=year]:w-[calc(4ch+4px)] data-[type=literal]:p-0 data-[empty]:not-focus:text-fg-subtle focus:bg-primary-solid focus:text-primary-fg-solid data-[empty]:not-focus:group-data-[invalid]/date:text-error-fg focus:group-data-[invalid]/date:bg-error-solid focus:group-data-[invalid]/date:text-error-fg-solid"
                    />
                  )}
                </For>
              )}
            </DateInput>
          </Field>
          <Show when={dirty()}>
            <span role="status" class="shrink-0 text-xs text-fg-subtle">
              Not applied
            </span>
          </Show>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Apply date"
            disabled={!draft()}
            onClick={apply}
          >
            <Check />
          </Button>
        </div>
      </div>
      <div
        class="px-2 pt-3 pb-2"
        onKeyDown={(event) => {
          if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
        }}
      >
        <Calendar
          aria-label="Choose date"
          controller={calendar}
          value={draft()}
          defaultMonth={Temporal.Now.plainDateISO().toString().slice(0, 7)}
          today={Temporal.Now.plainDateISO().toString()}
          locale="en-US"
          weekdayFormat="narrow"
          fixedWeeks
          onValueChange={(value) => {
            if (value && !Array.isArray(value)) props.onChange(value);
          }}
          class="mx-auto w-full max-w-66 text-sm"
        >
          <header class="mb-2 flex items-center justify-between font-semibold">
            <CalendarPrevious
              aria-label="Previous month"
              class="grid size-7 place-items-center rounded-[6px] border border-border"
            >
              <ChevronLeft class="size-4" />
            </CalendarPrevious>
            <CalendarHeading render={(part) => <span {...part} />} />
            <CalendarNext
              aria-label="Next month"
              class="grid size-7 place-items-center rounded-[6px] border border-border"
            >
              <ChevronRight class="size-4" />
            </CalendarNext>
          </header>
          <CalendarGrid class="w-full table-fixed border-collapse">
            <CalendarWeekdays>
              {(index) => (
                <CalendarWeekday index={index} class="h-7 text-xs font-normal text-fg-subtle" />
              )}
            </CalendarWeekdays>
            <CalendarWeeks>
              {(cell) => (
                <CalendarDay
                  value={cell.date}
                  render={(part) => (
                    <td class="h-7.5 px-0 py-px text-center">
                      <button
                        {...part}
                        class="h-7.5 w-8 rounded-[6px] tabular-nums hover:bg-control-hover data-[outside]:text-fg-subtle data-[selected]:bg-primary-solid data-[selected]:text-primary-fg-solid data-[selected]:hover:bg-primary-solid-hover focus-visible:outline-2 focus-visible:outline-primary-border-hover focus-visible:outline-offset-1"
                      />
                    </td>
                  )}
                />
              )}
            </CalendarWeeks>
          </CalendarGrid>
        </Calendar>
      </div>
    </div>
  );
}

export * as DateCommand from "./date-command";
