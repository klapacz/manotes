import { DateTime, Effect } from "effect";
import { createSignal, untrack } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { MaterializedEventService } from "../../lib";
import { createEffectCommand } from "../../lib/solid-effect";
import { JSDateToPlainDate, plainDateToJSDate } from "../../lib/temporal/utils";
import { CalendarIcon } from "../icons";
import {
  Calendar,
  CalendarGrid,
  CalendarHeader,
  CalendarHeading,
  CalendarNextTrigger,
  CalendarPrevTrigger,
} from "../ui/calendar";
import { Popover, PopoverContent, PopoverPortal, PopoverTrigger } from "../ui/popover";

/** Calendar button opening a date picker that rewrites the note's date. */
export function DatePicker(props: { noteId: string; date: string }) {
  const [open, setOpen] = createSignal(false);
  const setDate = createEffectCommand(setNoteDate);
  const selectedDate = () => plainDateToJSDate(Temporal.PlainDate.from(props.date));

  async function handleSelect(value: Date | null) {
    if (!value || setDate.pending()) return;

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
            selectionMode="single"
            value={selectedDate()}
            onChange={(value) => void handleSelect(value)}
            defaultFocusedValue={untrack(selectedDate)}
          >
            <CalendarHeader>
              <CalendarPrevTrigger />
              <CalendarHeading />
              <CalendarNextTrigger />
            </CalendarHeader>
            <CalendarGrid />
          </Calendar>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

const setNoteDate = Effect.fn("ComponentsNoteDatePicker.setDate")(function* (input: {
  readonly noteId: string;
  readonly date: string;
}) {
  const service = yield* MaterializedEventService.Service;

  return yield* service.setDate({
    noteId: input.noteId,
    date: input.date,
    createdAt: yield* DateTime.now,
  });
});
