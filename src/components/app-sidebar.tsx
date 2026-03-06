import { useNavigate } from "@tanstack/solid-router";
import { Index, createMemo } from "solid-js";
import { Temporal } from "temporal-polyfill";
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
  SidebarGroupLabel,
} from "./ui/sidebar";

type AppSidebarProps = {
  graph: string;
  date: string;
};

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
  const navigate = useNavigate();
  const selectedDate = createMemo(() => {
    const date = Temporal.PlainDate.from(props.date);
    return new Date(date.year, date.month - 1, date.day);
  });

  return (
    <Sidebar>
      <div class="border-sidebar-border flex h-12 items-center border-b px-4 text-sm font-semibold">
        Manotes
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
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
