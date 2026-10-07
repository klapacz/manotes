import { Link, getRouteApi, useMatchRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { OpenAIKeyModal } from "./openai-key-modal";
import { AudioMemo } from "./audio-memo";
import { GraphMenu } from "./graph-menu";
import { DatabaseIcon, HouseIcon } from "./icons";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { buttonVariants } from "./ui/button";
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
          <Show when={!onStudio()}>
            <AudioMemo.RecordingsLink />
          </Show>
          <OpenAIKeyModal.Root />
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
        </div>
      </div>
    </div>
  );
}
