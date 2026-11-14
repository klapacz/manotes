import type { DropdownMenuTriggerProps } from "@kobalte/core/dropdown-menu";
import { Effect, Exit } from "effect";
import { For, Show } from "solid-js";
import { toast } from "somoto";
import { GraphEncryption } from "@manotes/shared/graph-encryption";
import { bindRt } from "../lib";
import { GraphRuntimeContext } from "../lib/graph-access/graph-runtime/context";
import { KeyStore } from "../lib/graph-access/key-store/service";
import { LocalRegistry } from "../lib/graph-access/local-registry";
import { GraphBackupFile } from "../lib/graph-backup/file";
import { GraphBackupService } from "../lib/graph-backup/service";
import { PrimaryColor } from "../lib/primary-color";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuItemLink,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  ChevronLeftIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  LockIcon,
  PaletteIcon,
  TerminalIcon,
} from "./icons";
import { GraphAccessRuntime } from "../lib/graph-access/runtime";
import { useAtom } from "@effect/atom-solid";
import { Button } from "./ui/button";
import { CliSetupDialog } from "./cli-setup-dialog";
import { OpenAIKeyModal } from "./openai-key-modal";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/blocks/sidebar-01/components/nav-user.tsx
// Why: the current-graph control should own graph identity and graph actions.
// Modifications: removed avatar visuals, replaced user identity with graph identity, and wired the export backup action with Manotes backup services and toast feedback.
const ExportBackup = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsGraphMenu.exportBackup")(function* (sourceGraphDisplayName: string) {
      const backup = yield* GraphBackupService.exportBackup({
        sourceGraphDisplayName,
      });

      yield* GraphBackupFile.downloadBackupFile(backup);
    }),
  );
});

const LockGraph = GraphAccessRuntime.atom.fn(
  Effect.fn("ComponentsGraphMenu.lockGraph")(function* (
    envelope: GraphEncryption.GraphKeyEnvelope,
  ) {
    const keyStore = yield* KeyStore.Service;
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
  const graph = GraphRuntimeContext.use();
  const [exportBackupResult, exportBackup] = useAtom(ExportBackup, { mode: "promiseExit" });
  const [lockGraphResult, lockGraph] = useAtom(() => LockGraph, { mode: "promiseExit" });

  const cloudGraph = () => {
    const record = graph().record;

    return record.mode === "cloud" ? record : null;
  };

  async function handleExportBackup(displayName: string) {
    const exit = await exportBackup(displayName);

    if (Exit.isFailure(exit)) {
      toast.error("Failed to export backup");

      return;
    }

    toast.success("Backup exported");
  }

  async function handleLockGraph(envelope: GraphEncryption.GraphKeyEnvelope) {
    const exit = await lockGraph(envelope);

    if (Exit.isFailure(exit)) toast.error("Failed to lock graph");
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
            <OpenAIKeyModal.Root />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon class="size-4 text-fg-subtle" />
                <span class="flex flex-1 items-baseline justify-between gap-2">
                  <span>Primary color</span>
                  <span class="text-xs text-fg-subtle">This device</span>
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent class="max-h-[min(24rem,var(--kb-popper-content-available-height))] overflow-y-auto">
                  <DropdownMenuRadioGroup
                    aria-label="Primary color"
                    value={graph().primaryColor.color()}
                    onChange={(color) => graph().primaryColor.setColor(color)}
                  >
                    <For each={PrimaryColor.colors}>
                      {(color) => (
                        <DropdownMenuRadioItem value={color} class="capitalize">
                          <span
                            aria-hidden="true"
                            class="size-4 rounded-full"
                            style={{ "background-color": `var(--color-${color}-9)` }}
                          />
                          <span class="flex flex-1 items-baseline justify-between gap-2">
                            <span>{color}</span>
                            <Show when={color === "green"}>
                              <span class="text-xs text-fg-subtle">Default</span>
                            </Show>
                          </span>
                        </DropdownMenuRadioItem>
                      )}
                    </For>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
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
                    disabled={lockGraphResult().waiting}
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
