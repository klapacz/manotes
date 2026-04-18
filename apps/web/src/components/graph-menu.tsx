import type { DropdownMenuTriggerProps } from "@kobalte/core/dropdown-menu";
import { Effect } from "effect";
import { toast } from "somoto";
import { RtAtom } from "../lib";
import { useGraph } from "../lib/graph-access/graph-runtime/context";
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
import { ChevronLeftIcon, ChevronsUpDownIcon, DownloadIcon } from "./icons";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/blocks/sidebar-01/components/nav-user.tsx
// Why: the current-graph control should match the sidebar account-menu pattern and own its graph actions.
// Modifications: removed avatar visuals, replaced user identity with graph identity, changed placement to top-start, and wired the export backup action with Manotes backup services and toast feedback.
const ExportBackup = RtAtom.fn(
  Effect.fn("ComponentsGraphMenu.exportBackup")(function* (sourceGraphDisplayName: string) {
    const backup = yield* GraphBackupService.exportBackup({
      sourceGraphDisplayName,
    });

    yield* GraphBackupFile.downloadBackupFile(backup);
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
  const [exportBackupResult, exportBackup] = RtAtom.use(ExportBackup, { mode: "promise" });

  async function handleExportBackup(displayName: string) {
    try {
      await exportBackup(displayName);
      toast.success("Backup exported");
    } catch {
      toast.error("Failed to export backup");
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu placement="top-start">
          <DropdownMenuTrigger
            as={(triggerProps: DropdownMenuTriggerProps<HTMLButtonElement>) => (
              <SidebarMenuButton
                {...triggerProps}
                size="lg"
                class="data-expanded:bg-control-hover data-expanded:text-fg"
              >
                <GraphMenuIdentity graph={graph().record} />
                <ChevronsUpDownIcon class="ml-auto size-4" />
              </SidebarMenuButton>
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
                <DropdownMenuItemLink to="/">
                  <ChevronLeftIcon class="size-4" />
                  All graphs
                </DropdownMenuItemLink>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
