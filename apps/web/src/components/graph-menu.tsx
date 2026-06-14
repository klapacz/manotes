import type { DropdownMenuTriggerProps } from "@kobalte/core/dropdown-menu";
import { Effect } from "effect";
import { Show } from "solid-js";
import { toast } from "somoto";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
import { bindRt } from "../lib";
import { useGraph } from "../lib/graph-access/graph-runtime/context";
import * as KeyStoreService from "../lib/graph-access/key-store/service";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphBackupFile from "../lib/graph-backup/file";
import * as GraphBackupService from "../lib/graph-backup/service";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuItemLink,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ChevronLeftIcon, ChevronsUpDownIcon, DownloadIcon, LockIcon } from "./icons";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { useAtom } from "@effect/atom-solid";
import { Button } from "./ui/button";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/blocks/sidebar-01/components/nav-user.tsx
// Why: the current-graph control should own graph identity and graph actions.
// Modifications: removed avatar visuals, replaced user identity with graph identity, and wired the export backup action with Manotes backup services and toast feedback.
const ExportBackup = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsGraphMenu.exportBackup")(function* (sourceGraphDisplayName: string) {
      const backup = yield* GraphBackupService.exportBackup({
        sourceGraphDisplayName,
      });

      yield* GraphBackupFile.downloadBackupFile(backup);
    }),
  ),
);

const LockGraph = GraphAccessRuntime.atom.fn(
  Effect.fn("ComponentsGraphMenu.lockGraph")(function* (
    envelope: GraphEncryption.GraphKeyEnvelope,
  ) {
    const keyStore = yield* KeyStoreService.Service;
    yield* keyStore.remove(envelope);
  }),
);

const GraphMenuIdentity = (props: { graph: LocalRegistry.Schema.Record }) => {
  return (
    <div class="grid min-w-0 flex-1 text-left text-sm leading-tight">
      <span class="truncate font-semibold">{props.graph.displayName}</span>
      <span class="text-fg-subtle truncate text-xs">
        {LocalRegistry.Labels.graphMode(props.graph.mode)}
      </span>
    </div>
  );
};

export const GraphMenu = () => {
  const graph = useGraph();
  const [exportBackupResult, exportBackup] = useAtom(ExportBackup, { mode: "promise" });
  const [lockGraphResult, lockGraph] = useAtom(() => LockGraph, { mode: "promise" });

  const cloudGraph = () => {
    const record = graph().record;
    return record.mode === "cloud" ? record : null;
  };

  async function handleExportBackup(displayName: string) {
    try {
      await exportBackup(displayName);
      toast.success("Backup exported");
    } catch {
      toast.error("Failed to export backup");
    }
  }

  async function handleLockGraph(envelope: GraphEncryption.GraphKeyEnvelope) {
    try {
      await lockGraph(envelope);
    } catch {
      toast.error("Failed to lock graph");
    }
  }

  return (
    <DropdownMenu placement="bottom-start">
      <DropdownMenuTrigger
        as={(triggerProps: DropdownMenuTriggerProps<HTMLButtonElement>) => (
          <Button
            {...triggerProps}
            variant="ghost"
            class="data-expanded:bg-control-hover data-expanded:text-fg"
          >
            <span class="truncate font-medium">{graph().record.displayName}</span>
            <ChevronsUpDownIcon class="size-3.5 text-fg-subtle" />
          </Button>
        )}
      />
      <DropdownMenuPortal>
        <DropdownMenuContent class="w-(--kb-popper-anchor-width) min-w-56 rounded-lg">
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel class="p-0 font-normal">
              <div class="px-1 py-1.5 text-left text-sm">
                <GraphMenuIdentity graph={graph().record} />
              </div>
            </DropdownMenuGroupLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => void handleExportBackup(graph().record.displayName)}
              disabled={exportBackupResult().waiting}
            >
              <DownloadIcon class="size-4" />
              Export backup
            </DropdownMenuItem>
            <Show when={cloudGraph()}>
              {(cloudGraph) => (
                <DropdownMenuItem
                  onSelect={() => void handleLockGraph(cloudGraph().graphKeyEnvelope)}
                  disabled={lockGraphResult().waiting}
                >
                  <LockIcon class="size-4" />
                  Lock graph
                </DropdownMenuItem>
              )}
            </Show>
            <DropdownMenuItemLink to="/">
              <ChevronLeftIcon class="size-4" />
              All graphs
            </DropdownMenuItemLink>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
};
