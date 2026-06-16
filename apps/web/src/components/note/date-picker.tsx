import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect } from "effect";
import { For, createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { MaterializedEventService, bindRt } from "../../lib";
import { JSDateToPlainDate, plainDateToJSDate } from "../../lib/temporal/utils";
import { CalendarIcon } from "../icons";
import {
  Calendar,
  CalendarCell,
  CalendarCellTrigger,
  CalendarHeadCell,
  CalendarLabel,
  CalendarNav,
  CalendarTable,
} from "../ui/calendar";
import { Popover, PopoverContent, PopoverPortal, PopoverTrigger } from "../ui/popover";

/** Calendar button opening a date picker that rewrites the note's date. */
export function DatePicker(props: { noteId: string; date: string }) {
  const [open, setOpen] = createSignal(false);
  const [setDateResult, setDate] = useAtom(SetDate, { mode: "promise" });
  const selectedDate = () => plainDateToJSDate(Temporal.PlainDate.from(props.date));

  async function handleSelect(value: Date | null) {
    if (!value || setDateResult().waiting) return;
    try {
      await setDate({
        noteId: props.noteId,
        date: JSDateToPlainDate(value).toString(),
      });
      setOpen(false);
    } catch {}
  }

  return (
    <Popover open={open()} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Edit note date"
        title="Edit note date"
        class="rounded p-1 hover:bg-control-hover hover:text-fg"
      >
        <CalendarIcon class="size-3.5" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent class="w-auto p-3">
          <Calendar
            mode="single"
            value={selectedDate()}
            onValueChange={(value) => void handleSelect(value)}
            initialMonth={selectedDate()}
            initialFocusedDay={selectedDate()}
          >
            {(calendar) => (
              <div>
                <div class="flex items-center justify-between pb-2">
                  <CalendarNav action="prev-month" aria-label="Previous month" />
                  <CalendarLabel>{formatMonthLabel(calendar.month)}</CalendarLabel>
                  <CalendarNav action="next-month" aria-label="Next month" />
                </div>
                <CalendarTable>
                  <thead>
                    <tr>
                      <For each={calendar.weekdays}>
                        {(weekday) => (
                          <CalendarHeadCell>{formatWeekdayLabel(weekday)}</CalendarHeadCell>
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
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

const SetDate = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteDatePicker.setDate")(function* (input: {
      readonly noteId: string;
      readonly date: string;
    }) {
      const service = yield* MaterializedEventService.Service;
      return yield* service.setDate({
        noteId: input.noteId,
        date: input.date,
        createdAt: yield* DateTime.now,
      });
    }),
  ),
);

function formatMonthLabel(month: Date): string {
  return month.toLocaleString("en", { month: "long", year: "numeric" });
}

function formatWeekdayLabel(weekday: Date): string {
  return weekday.toLocaleString("en", { weekday: "narrow" });
}
