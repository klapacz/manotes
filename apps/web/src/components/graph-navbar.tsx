import { Link, getRouteApi, useMatchRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { GraphMenu } from "./graph-menu";
import { DatabaseIcon, HouseIcon, SearchIcon } from "./icons";
import { NoteSearchCommand } from "./note-search-command";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { Button, buttonVariants } from "./ui/button";
import { WorkerHealthBanner } from "./worker-health-banner";

const graphRoute = getRouteApi("/$graph");

export function GraphNavbar() {
  const params = graphRoute.useParams();
  const matchRoute = useMatchRoute();
  const onStudio = matchRoute({ to: "/$graph/studio" });

  return (
    <div class="z-20 border-b border-border-subtle">
      <div class="flex flex-wrap items-center gap-2 px-4 py-2">
        <GraphMenu />
        <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SyncStatusIndicator />
          <WorkerHealthBanner />
          <Show
            when={onStudio()}
            fallback={
              <Link
                to="/$graph/studio"
                params={{ graph: params().graph }}
                class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                title="Database"
              >
                <DatabaseIcon />
              </Link>
            }
          >
            <Link
              to="/$graph"
              params={{ graph: params().graph }}
              class={buttonVariants({ variant: "ghost", size: "icon-sm" })}
              title="Back to notes"
            >
              <HouseIcon />
            </Link>
          </Show>
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
