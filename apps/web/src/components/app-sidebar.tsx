import { useLocation, useNavigate } from "@tanstack/solid-router";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { createWritableMemo } from "@solid-primitives/memo";
import { Index, createMemo } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { requestScrollToDate } from "../lib/daily-note";
import * as Y from "yjs";
import { MaterializedEventService, MatchAsyncResult, RtAtom } from "../lib";
import * as GraphBackupFile from "../lib/graph-backup/file";
import * as GraphBackupService from "../lib/graph-backup/service";
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
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent } from "./ui/sidebar";
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

const ExportBackup = RtAtom.fn(
  Effect.fn("ComponentsAppSidebar.exportBackup")(function* (sourceGraphDisplayName: string) {
    const backup = yield* GraphBackupService.exportBackup({
      sourceGraphDisplayName,
    });

    yield* GraphBackupFile.downloadBackupFile(backup);
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

export const AppSidebar = (props: { graphDisplayName: string }) => {
  const searchDate = useLocation({
    select: (location) => location.search.date,
  });
  const navigate = useNavigate();
  const [createNoteResult, createNote] = RtAtom.use(CreateNote, { mode: "promise" });
  const [exportBackupResult, exportBackup] = RtAtom.use(ExportBackup, { mode: "promise" });

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

  async function handleExportBackup() {
    try {
      await exportBackup(props.graphDisplayName);
    } catch {}
  }

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
                              {(day) => (
                                <CalendarCell class="flex-1">
                                  <CalendarCellTrigger class="w-full" day={day()}>
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

      <SidebarGroup class="gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleExportBackup()}
          disabled={exportBackupResult().waiting}
        >
          Export backup
        </Button>
        <SyncStatusIndicator />
        <WorkerHealthBanner />
        <MatchAsyncResult
          when={exportBackupResult()}
          onError={() => <p class="text-error-fg text-xs">Failed to export backup</p>}
          onDefect={() => <p class="text-error-fg text-xs">Failed to export backup</p>}
        />
      </SidebarGroup>
    </Sidebar>
  );
};
