import { For, type JSX } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { JSDateToPlainDate, plainDateToJSDate } from "@manotes/shared/temporal/utils";
import { QueryEngine } from "../../lib/query-engine";
import { DateSuggestions } from "../../lib/date-suggestions";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import {
  Calendar,
  CalendarCell,
  CalendarCellTrigger,
  CalendarHeadCell,
  CalendarLabel,
  CalendarNav,
  CalendarTable,
} from "../ui/calendar";

export function Root(props: {
  label: string;
  value: string | undefined;
  initialText: string;
  initialSearch?: string;
  onChange: (date: string) => void;
  onBack: () => void;
  children?: JSX.Element;
}) {
  const query = QueryEngine.map(DateSuggestions.query, (date) => ({
    value: date.id,
    label: date.title,
  }));

  return (
    <Picker.Query
      query={query}
      label={props.label}
      defaultSearch={props.initialText}
      initialSearch={props.initialSearch}
      selected={props.value}
      onSelect={(date) => props.onChange(date.value)}
    >
      {(items) => (
        <CommandList style={{ "--command-list-height": "min(32rem,65dvh)" }}>
          <CommandScroll>
            {items}
            <div class="mt-1 border-t border-border-subtle">
              <DateCalendar value={props.value} onChange={props.onChange} />
            </div>
          </CommandScroll>
          <Picker.Footer>
            <Picker.Back tabIndex={0} onSelect={props.onBack} />
            {props.children}
          </Picker.Footer>
        </CommandList>
      )}
    </Picker.Query>
  );
}

function DateCalendar(props: { value: string | undefined; onChange: (date: string) => void }) {
  const selectedDate = () => {
    return props.value ? plainDateToJSDate(Temporal.PlainDate.from(props.value)) : new Date();
  };

  return (
    <div
      class="flex justify-center p-3"
      onKeyDown={(event) => {
        // Let the calendar handle its keys without also navigating command items.
        if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
      }}
    >
      <Calendar
        mode="single"
        value={props.value ? selectedDate() : undefined}
        onValueChange={(value) => {
          if (value) props.onChange(JSDateToPlainDate(value).toString());
        }}
        initialMonth={selectedDate()}
        initialFocusedDay={selectedDate()}
      >
        {(calendar) => (
          <div>
            <div class="flex items-center justify-between pb-2">
              <CalendarNav action="prev-month" aria-label="Previous month" />
              <CalendarLabel>
                {calendar.month.toLocaleString("en", { month: "long", year: "numeric" })}
              </CalendarLabel>
              <CalendarNav action="next-month" aria-label="Next month" />
            </div>
            <CalendarTable>
              <thead>
                <tr>
                  <For each={calendar.weekdays}>
                    {(weekday) => (
                      <CalendarHeadCell>
                        {weekday.toLocaleString("en", { weekday: "narrow" })}
                      </CalendarHeadCell>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={calendar.weeks}>
                  {(week) => (
                    <tr>
                      <For each={week}>
                        {(day) => (
                          <CalendarCell>
                            <CalendarCellTrigger day={day}>{day.getDate()}</CalendarCellTrigger>
                          </CalendarCell>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </CalendarTable>
          </div>
        )}
      </Calendar>
    </div>
  );
}

export * as DateCommand from "./date-command";
