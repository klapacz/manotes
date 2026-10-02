import type { DropdownMenuTriggerProps } from "@kobalte/core/dropdown-menu";
import { Effect } from "effect";
import { Show } from "solid-js";
import { toast } from "./ui/toast";
import * as GraphEncryption from "@manotes/shared/graph-encryption";
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
import { ChevronLeftIcon, ChevronsUpDownIcon, DownloadIcon, LockIcon, TerminalIcon } from "./icons";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { createEffectCommand } from "../lib/solid-effect";
import { Button } from "./ui/button";
import { CliSetupDialog } from "./cli-setup-dialog";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/blocks/sidebar-01/components/nav-user.tsx
// Why: the current-graph control should own graph identity and graph actions.
// Modifications: removed avatar visuals, replaced user identity with graph identity, and wired the export backup action with Manotes backup services and toast feedback.
const exportBackupEffect = Effect.fn("ComponentsGraphMenu.exportBackup")(function* (
  sourceGraphDisplayName: string,
) {
  const backup = yield* GraphBackupService.exportBackup({
    sourceGraphDisplayName,
  });

  yield* GraphBackupFile.downloadBackupFile(backup);
});

const lockGraphEffect = Effect.fn("ComponentsGraphMenu.lockGraph")(function* (
  envelope: GraphEncryption.GraphKeyEnvelope,
) {
  const keyStore = yield* KeyStoreService.Service;
  yield* keyStore.remove(envelope);
});

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
  const exportBackup = createEffectCommand(exportBackupEffect);
  // The key store belongs to graph access, not the open graph's runtime.
  const lockGraph = createEffectCommand(lockGraphEffect, GraphAccessRuntime.rt);

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
              disabled={exportBackup.pending()}
            >
              <DownloadIcon class="size-4" />
              Export backup
            </DropdownMenuItem>
            <Show when={cloudGraph()}>
              {(cloudGraph) => (
                <>
                  {/* Keep the menu mounted while its dialog is open. */}
                  <CliSetupDialog<typeof DropdownMenuItem>
                    graph={cloudGraph()}
                    as={DropdownMenuItem}
                    closeOnSelect={false}
                  >
                    <TerminalIcon class="size-4" />
                    Set up CLI
                  </CliSetupDialog>
                  <DropdownMenuItem
                    onSelect={() => void handleLockGraph(cloudGraph().graphKeyEnvelope)}
                    disabled={lockGraph.pending()}
                  >
                    <LockIcon class="size-4" />
                    Lock graph
                  </DropdownMenuItem>
                </>
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
