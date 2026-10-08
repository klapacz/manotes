import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect } from "effect";
import { For } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { MaterializedEventService, bindRt } from "../../lib";
import { JSDateToPlainDate, plainDateToJSDate } from "@manotes/shared/temporal/utils";
import {
  Calendar,
  CalendarCell,
  CalendarCellTrigger,
  CalendarHeadCell,
  CalendarLabel,
  CalendarNav,
  CalendarTable,
} from "../ui/calendar";
import { Popover, PopoverContent, PopoverPortal } from "../ui/popover";

/**
 * Calendar popover that rewrites the note's date. It has no trigger of its own
 * (a menu item opens it), so it anchors to and returns focus to `anchor`.
 */
export function DatePicker(props: {
  noteId: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: HTMLElement | undefined;
}) {
  const [setDateResult, setDate] = useAtom(SetDate, { mode: "promise" });
  const selectedDate = () => plainDateToJSDate(Temporal.PlainDate.from(props.date));

  async function handleSelect(value: Date | null) {
    if (!value || setDateResult().waiting) return;

    try {
      await setDate({
        noteId: props.noteId,
        date: JSDateToPlainDate(value).toString(),
      });
      props.onOpenChange(false);
    } catch {}
  }

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange} anchorRef={() => props.anchor}>
      <PopoverPortal>
        <PopoverContent
          class="w-auto p-3"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            props.anchor?.focus();
          }}
        >
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
