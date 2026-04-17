import { useLocation, useNavigate } from "@tanstack/solid-router";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { createWritableMemo } from "@solid-primitives/memo";
import { Index, createMemo } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { requestScrollToDate } from "../lib/daily-note";
import * as Y from "yjs";
import { MaterializedEventService, MatchAsyncResult, RtAtom } from "../lib";
import type * as LocalRegistry from "../lib/graph-access/local-registry";
import { JSDateToPlainDate } from "../lib/temporal/utils";
import { GraphMenu } from "./graph-menu";
import { PlusIcon, SearchIcon } from "./icons";
import { NoteSearchCommand } from "./note-search-command";
import { Button } from "./ui/button";
import {
  Calendar,
  CalendarCell,
  CalendarCellLink,
  CalendarHeadCell,
  CalendarLabel,
  CalendarNav,
  CalendarTable,
} from "./ui/calendar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
} from "./ui/sidebar";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { WorkerHealthBanner } from "./worker-health-banner";

const EMPTY_YJS_UPDATE = Y.encodeStateAsUpdate(new Y.Doc());

const CreateNote = RtAtom.fn(
  Effect.fn("ComponentsAppSidebar.createNote")(function* (_: void) {
    const service = yield* MaterializedEventService.Service;
    const noteId = nanoid();

    return yield* service.create({
      noteId,
      payload: EMPTY_YJS_UPDATE,
      createdAt: yield* DateTime.now,
    });
  }),
);

const weekdayLongFormatter = new Intl.DateTimeFormat("en", {
  weekday: "long",
});

const weekdayShortFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
});

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
});

export const AppSidebar = (props: { graph: LocalRegistry.Schema.Record }) => {
  const searchDate = useLocation({
    select: (location) => location.search.date,
  });
  const navigate = useNavigate();
  const [createNoteResult, createNote] = RtAtom.use(CreateNote, { mode: "promise" });

  async function handleCreateNote() {
    try {
      const note = await createNote();
      void navigate({
        from: "/$graph",
        to: "/$graph/note/$note",
        params: { note: note.id },
      });
    } catch {}
  }

  const selectedDate = createMemo(() => {
    const rawDate = searchDate();
    if (!rawDate) return null;
    const date = Temporal.PlainDate.from(rawDate);
    return new Date(date.year, date.month - 1, date.day);
  });

  const [displayedMonth, setDisplayedMonth] = createWritableMemo(() => selectedDate() ?? undefined);
  // TODO: Refresh this periodically so "today" does not stay frozen for the sidebar lifetime.
  const todayDate = Temporal.Now.plainDateISO().toString();

  return (
    <Sidebar>
      <div class="border-border flex h-12 items-center justify-between border-b px-2 text-sm font-semibold">
        <span class="text-base leading-none tracking-tight font-title-serif">Manotes</span>
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
            onClick={() => void handleCreateNote()}
            disabled={createNoteResult().waiting}
            title="Create note"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
      <MatchAsyncResult
        when={createNoteResult()}
        onError={() => <p class="text-error-fg px-4 py-1 text-xs">Failed to create note</p>}
        onDefect={() => <p class="text-error-fg px-4 py-1 text-xs">Failed to create note</p>}
      />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Calendar
              mode="single"
              value={selectedDate()}
              month={displayedMonth()}
              onMonthChange={setDisplayedMonth}
            >
              {(calendar) => (
                <div>
                  <div class="relative mb-2 flex items-center justify-between">
                    <CalendarNav action="prev-month" aria-label="Go to previous month" />
                    <CalendarLabel>
                      {monthFormatter.format(calendar.month)} {calendar.month.getFullYear()}
                    </CalendarLabel>
                    <CalendarNav action="next-month" aria-label="Go to next month" />
                  </div>
                  <CalendarTable class="w-full">
                    <thead>
                      <tr class="flex w-full">
                        <Index each={calendar.weekdays}>
                          {(weekday) => (
                            <CalendarHeadCell
                              class="flex-1"
                              abbr={weekdayLongFormatter.format(weekday())}
                            >
                              {weekdayShortFormatter.format(weekday())}
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
                              {(day) => {
                                const date = createMemo(() => JSDateToPlainDate(day()).toString());
                                const isOutsideMonth = createMemo(
                                  () => day().getMonth() !== calendar.month.getMonth(),
                                );

                                return (
                                  <CalendarCell class="flex-1">
                                    <CalendarCellLink
                                      class={isOutsideMonth() ? "w-full opacity-50" : "w-full"}
                                      from="/$graph/"
                                      to="/$graph"
                                      params={{ graph: props.graph.localGraphId }}
                                      search={{ date: date() }}
                                      viewTransition={false}
                                      data-today={todayDate === date() ? "" : undefined}
                                      onClick={(event) => {
                                        // Clicking the already-selected date
                                        // Re-scroll + focus via the shared signal.
                                        if (event.currentTarget.dataset.status === "active") {
                                          requestScrollToDate();
                                        }
                                      }}
                                    >
                                      {day().getDate()}
                                    </CalendarCellLink>
                                  </CalendarCell>
                                );
                              }}
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

      <SidebarFooter class="gap-1">
        <SyncStatusIndicator />
        <WorkerHealthBanner />
        <GraphMenu localGraphId={props.graph.localGraphId} />
      </SidebarFooter>
    </Sidebar>
  );
};
