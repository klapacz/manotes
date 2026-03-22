import { useMutation } from "@tanstack/solid-query";
import { useLocation, useNavigate } from "@tanstack/solid-router";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { createWritableMemo } from "@solid-primitives/memo";
import { Index, Show, createMemo } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { requestScrollToDate } from "../lib/daily-note";
import * as Y from "yjs";
import { MaterializedEventService, useRuntime } from "../lib";
import { PlusIcon, SearchIcon } from "./icons";
import { NoteSearchCommand } from "./note-search-command";
import { Button } from "./ui/button";
import {
  Calendar,
  CalendarCell,
  CalendarCellTrigger,
  CalendarHeadCell,
  CalendarLabel,
  CalendarNav,
  CalendarTable,
} from "./ui/calendar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from "./ui/sidebar";
import { WorkerHealthBanner } from "./worker-health-banner";

const EMPTY_YJS_UPDATE = Y.encodeStateAsUpdate(new Y.Doc());

const { format: formatWeekdayLong } = new Intl.DateTimeFormat("en", {
  weekday: "long",
});

const { format: formatWeekdayShort } = new Intl.DateTimeFormat("en", {
  weekday: "short",
});

const { format: formatMonth } = new Intl.DateTimeFormat("en", {
  month: "long",
});

export const AppSidebar = () => {
  const searchDate = useLocation({
    select: (location) => location.search.date,
  });
  const runtime = useRuntime();
  const navigate = useNavigate();

  const createNoteMutation = useMutation(() => ({
    mutationFn: async () => {
      const noteId = nanoid();

      return runtime().runPromise(
        Effect.gen(function* () {
          const service = yield* MaterializedEventService.Service;

          return yield* service.create({
            noteId,
            isDaily: false,
            payload: EMPTY_YJS_UPDATE,
            createdAt: yield* DateTime.now,
          });
        }),
      );
    },
    onSuccess(note) {
      void navigate({
        from: "/$graph",
        to: "/$graph/note/$note",
        params: { note: note.id },
      });
    },
  }));

  const selectedDate = createMemo(() => {
    const rawDate = searchDate();
    if (!rawDate) return null;
    const date = Temporal.PlainDate.from(rawDate);
    return new Date(date.year, date.month - 1, date.day);
  });

  const [displayedMonth, setDisplayedMonth] = createWritableMemo(
    () => selectedDate() ?? undefined,
  );

  return (
    <Sidebar>
      <div class="border-border flex h-12 items-center justify-between border-b px-2 text-sm font-semibold">
        <span class="text-base leading-none tracking-tight font-title-serif">
          Manotes
        </span>
        <div class="flex items-center gap-1">
          <NoteSearchCommand>
            {(openSearch) => (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={openSearch}
                title="Search notes (Ctrl+K)"
              >
                <SearchIcon />
              </Button>
            )}
          </NoteSearchCommand>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => createNoteMutation.mutate()}
            disabled={createNoteMutation.isPending}
            title="Create note"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
      <Show when={createNoteMutation.isError}>
        <p class="text-error-fg px-4 py-1 text-xs">Failed to create note</p>
      </Show>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Calendar
              mode="single"
              value={selectedDate()}
              month={displayedMonth()}
              onMonthChange={setDisplayedMonth}
              onValueChange={(value) => {
                if (!value) {
                  // Clicking the already-selected date deselects it.
                  // Re-scroll + focus via the shared signal.
                  requestScrollToDate();
                  return;
                }

                const date = new Temporal.PlainDate(
                  value.getFullYear(),
                  value.getMonth() + 1,
                  value.getDate(),
                ).toString();

                void navigate({
                  from: "/$graph",
                  to: "/$graph",
                  search: (current) => ({
                    ...current,
                    date,
                  }),
                });
              }}
            >
              {(calendar) => (
                <div>
                  <div class="relative mb-2 flex items-center justify-between">
                    <CalendarNav
                      action="prev-month"
                      aria-label="Go to previous month"
                    />
                    <CalendarLabel>
                      {formatMonth(calendar.month)}{" "}
                      {calendar.month.getFullYear()}
                    </CalendarLabel>
                    <CalendarNav
                      action="next-month"
                      aria-label="Go to next month"
                    />
                  </div>
                  <CalendarTable class="w-full">
                    <thead>
                      <tr class="flex w-full">
                        <Index each={calendar.weekdays}>
                          {(weekday) => (
                            <CalendarHeadCell
                              class="flex-1"
                              abbr={formatWeekdayLong(weekday())}
                            >
                              {formatWeekdayShort(weekday())}
                            </CalendarHeadCell>
                          )}
                        </Index>
                      </tr>
                    </thead>
                    <tbody>
                      <Index each={calendar.weeks}>
                        {(week) => (
                          <tr class="mt-1 flex w-full">
                            <Index each={week()}>
                              {(day) => (
                                <CalendarCell class="flex-1">
                                  <CalendarCellTrigger
                                    class="w-full"
                                    day={day()}
                                  >
                                    {day().getDate()}
                                  </CalendarCellTrigger>
                                </CalendarCell>
                              )}
                            </Index>
                          </tr>
                        )}
                      </Index>
                    </tbody>
                  </CalendarTable>
                </div>
              )}
            </Calendar>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarGroup>
        <WorkerHealthBanner />
      </SidebarGroup>
    </Sidebar>
  );
};
