import type { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { createMemo, Show } from "solid-js";
import { MenuQuery } from "../../lib/menu-query";
import { StreamSwitch } from "../../lib/record/stream-switch";
import { useIsMobile } from "../../lib/use-mobile";
import { ChevronsUpDownIcon } from "../icons";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";

const isApple =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

type SwitcherChoice = Picker.Choice & {
  readonly stream: StreamSwitch.Choice;
};

export function StreamSwitcher(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  presets: readonly PresetRecordRepo.Def[];
  matched: StreamSwitch.Choice | undefined;
  onSelect: (choice: StreamSwitch.Choice, next: boolean) => void;
}) {
  return (
    <Picker.Root label="Switch stream" open={props.open} onOpenChange={props.onOpenChange}>
      <Picker.Trigger title="Switch stream (S)">
        <span class="max-w-36 truncate sm:max-w-52">{props.matched?.label ?? "Stream"}</span>
        <ChevronsUpDownIcon class="size-3.5 shrink-0 text-fg-subtle" />
      </Picker.Trigger>
      <Picker.Content
        onCloseAutoFocus={
          props.onClose
            ? (event) => {
                event.preventDefault();
                props.onClose?.();
              }
            : undefined
        }
      >
        {(close) => (
          <StreamSwitcherCommands
            presets={props.presets}
            selected={props.matched?.value}
            onSelect={(choice, next) => {
              if (next) {
                close(() => props.onSelect(choice, true));
              } else {
                props.onSelect(choice, false);
                close();
              }
            }}
          />
        )}
      </Picker.Content>
    </Picker.Root>
  );
}

function StreamSwitcherCommands(props: {
  presets: readonly PresetRecordRepo.Def[];
  selected: string | undefined;
  onSelect: (choice: StreamSwitch.Choice, next: boolean) => void;
}) {
  const mobile = useIsMobile();

  const query = createMemo(() => {
    const toChoice = (
      stream: StreamSwitch.Choice,
      group: string,
      groupLabel: string,
    ): SwitcherChoice => ({
      value: stream.value,
      label: stream.label,
      group,
      groupLabel: () => groupLabel,
      stream,
    });

    const choices: readonly SwitcherChoice[] = [
      ...props.presets.map((preset) => {
        return toChoice(StreamSwitch.presetChoice(preset), "presets", "Presets");
      }),
      ...StreamSwitch.systemStreams.map((stream) => toChoice(stream, "system", "System")),
    ];

    return MenuQuery.choices(() => choices);
  });

  return (
    <Picker.Query
      label="Switch stream"
      query={query()}
      selected={props.selected}
      onSelect={(choice, event) => props.onSelect(choice.stream, isNextPane(event))}
    >
      {(items) => (
        <CommandList>
          <CommandScroll>{items}</CommandScroll>
          <Show when={!mobile()}>
            <Picker.Footer>
              <p class="px-2 py-1 text-xs text-fg-subtle">
                Enter to switch · {isApple ? "⌘Enter" : "Ctrl+Enter"} to open next pane
              </p>
            </Picker.Footer>
          </Show>
        </CommandList>
      )}
    </Picker.Query>
  );
}

function isNextPane(event: Event): boolean {
  return (
    (event instanceof KeyboardEvent || event instanceof MouseEvent) &&
    (event.metaKey || event.ctrlKey)
  );
}
