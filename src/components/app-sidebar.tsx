import { useMutation } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { Index, Show, createMemo } from "solid-js";
import { Temporal } from "temporal-polyfill";
import * as Y from "yjs";
import { MaterializedEventService, useRuntime } from "../lib";
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

type AppSidebarProps = {
  graph: string;
  date: string;
};

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

export const AppSidebar = (props: AppSidebarProps) => {
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
        to: "/$graph/note/$note",
        params: { graph: props.graph, note: note.id },
      });
    },
  }));

  const selectedDate = createMemo(() => {
    const date = Temporal.PlainDate.from(props.date);
    return new Date(date.year, date.month - 1, date.day);
  });

  return (
    <Sidebar>
      <div class="border-sidebar-border flex h-12 items-center border-b px-4 text-sm font-semibold">
        Manotes
      </div>
      <SidebarContent
        style={{
          "--color-accent": "var(--color-sidebar-accent)",
          "--color-accent-foreground": "var(--color-sidebar-accent-foreground)",
        }}
      >
        <SidebarGroup>
          <SidebarGroupContent>
            <div class="mb-3 px-1">
              <Button
                class="w-full"
                onClick={() => createNoteMutation.mutate()}
                disabled={createNoteMutation.isPending}
              >
                {createNoteMutation.isPending ? "Creating..." : "Create"}
              </Button>
              <Show when={createNoteMutation.isError}>
                <p class="text-destructive mt-2 text-xs">
                  Failed to create note
                </p>
              </Show>
            </div>
            <NoteSearchCommand graph={props.graph} />
            <Calendar
              mode="single"
              value={selectedDate()}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }

                const date = new Temporal.PlainDate(
                  value.getFullYear(),
                  value.getMonth() + 1,
                  value.getDate(),
                ).toString();

                navigate({
                  to: "/$graph",
                  params: { graph: props.graph },
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
    </Sidebar>
  );
};
