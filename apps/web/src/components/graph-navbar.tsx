import { GraphMenu } from "./graph-menu";
import { SearchIcon } from "./icons";
import { NoteSearchCommand } from "./note-search-command";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { Button } from "./ui/button";
import { WorkerHealthBanner } from "./worker-health-banner";

export function GraphNavbar() {
  return (
    <div class="z-20 border-b border-border-subtle">
      <div class="flex flex-wrap items-center gap-2 px-4 py-2">
        <GraphMenu />
        <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SyncStatusIndicator />
          <WorkerHealthBanner />
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
        </div>
      </div>
    </div>
  );
}
