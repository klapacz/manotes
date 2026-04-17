import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { Button } from "../../components/ui/button";
import { ListItem } from "../../components/ui/list";
import { cx } from "../../lib/cva";
import * as LocalRegistry from "../../lib/graph-access/local-registry";
import { RenameGraphDialog } from "./RenameGraphDialog";
import { UploadGraphDialog } from "./UploadGraphDialog";

type Props = {
  graph: LocalRegistry.Schema.Record;
};

export function GraphListItem(props: Props) {
  return (
    <ListItem
      interactive
      class="[--px:--spacing(4)] [--py:--spacing(3)] flex items-baseline gap-(--px) px-(--px) py-(--py)"
    >
      <Link
        to="/$graph"
        params={{ graph: props.graph.localGraphId }}
        preload={false}
        class={cx(
          "min-w-0 -mx-(--px) -my-(--py) px-(--px) py-(--py) font-medium grow",
          props.graph.mode !== "local" && "col-span-2",
        )}
      >
        <span class="block truncate">{props.graph.displayName}</span>
      </Link>

      <Show when={props.graph.mode === "local"}>
        <RenameGraphDialog<typeof Button> graph={props.graph} as={Button} variant="ghost" size="sm">
          Rename
        </RenameGraphDialog>
        <UploadGraphDialog<typeof Button> graph={props.graph} as={Button} variant="ghost" size="sm">
          Upload
        </UploadGraphDialog>
      </Show>

      <span class="uppercase tracking-wide text-xs">
        {LocalRegistry.Labels.graphMode(props.graph.mode)}
      </span>
    </ListItem>
  );
}
