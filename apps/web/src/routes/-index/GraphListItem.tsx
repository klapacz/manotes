import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { Button } from "../../components/ui/button";
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import { UploadGraphDialog } from "./UploadGraphDialog";
import { Match } from "effect";
import { cx } from "../../lib/cva";

type Props = {
  graph: LocalRegistry.Schema.Record;
};

export function GraphListItem(props: Props) {
  return (
    <>
      <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center rounded-xl border border-border transition-colors hover:bg-bg-subtle">
        <Link
          to="/$graph"
          params={{ graph: props.graph.localGraphId }}
          preload={false}
          class={cx("min-w-0 px-4 py-3 font-medium", props.graph.mode !== "local" && "col-span-2")}
        >
          <span class="block truncate">{props.graph.displayName}</span>
        </Link>

        <Show when={props.graph.mode === "local"}>
          <div class="flex min-w-24 justify-end px-2 py-2">
            <UploadGraphDialog<typeof Button>
              graph={props.graph}
              as={Button}
              variant="ghost"
              size="sm"
            >
              Upload
            </UploadGraphDialog>
          </div>
        </Show>

        <span class="px-4 text-xs uppercase tracking-wide text-fg-subtle">
          {graphModeLabel(props.graph.mode)}
        </span>
      </div>
    </>
  );
}

const graphModeLabel = Match.type<LocalRegistry.Schema.Record["mode"]>().pipe(
  Match.when("cloud", () => "synced"),
  Match.when("local", () => "local"),
  Match.exhaustive,
);
