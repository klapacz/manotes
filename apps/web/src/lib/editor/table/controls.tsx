import { GripHorizontal, GripVertical } from "lucide-solid";
import type { Editor } from "prosekit/core";
import { useEditorDerivedValue } from "prosekit/solid";
import { MenuItem, MenuPopup, MenuPositioner } from "prosekit/solid/menu";
import {
  TableHandleRoot,
  TableHandleColumnPositioner,
  TableHandleColumnPopup,
  TableHandleColumnMenuRoot,
  TableHandleColumnMenuTrigger,
  TableHandleRowPositioner,
  TableHandleRowPopup,
  TableHandleRowMenuRoot,
  TableHandleRowMenuTrigger,
} from "prosekit/solid/table-handle";
import { For } from "solid-js";
import type { AppExtension } from "../../../editor.extension";
import { commandItemBaseClass, commandSurfaceClass } from "../../../components/ui/command";
import { cx } from "../../cva";

const triggerClass = "bg-bg text-fg-subtle hover:bg-control-hover flex rounded border p-1";

export function TableControls() {
  return (
    <TableHandleRoot>
      <TableHandleColumnPositioner class="z-50 block">
        <TableHandleColumnPopup class="flex translate-y-1/2">
          <TableHandleColumnMenuRoot>
            <TableHandleColumnMenuTrigger class={triggerClass} aria-label="Column actions">
              <GripHorizontal size={16} />
            </TableHandleColumnMenuTrigger>
            <TableActions kind="column" />
          </TableHandleColumnMenuRoot>
        </TableHandleColumnPopup>
      </TableHandleColumnPositioner>
      <TableHandleRowPositioner placement="left" class="z-50 block">
        <TableHandleRowPopup class="flex translate-x-1/2">
          <TableHandleRowMenuRoot>
            <TableHandleRowMenuTrigger class={triggerClass} aria-label="Row actions">
              <GripVertical size={16} />
            </TableHandleRowMenuTrigger>
            <TableActions kind="row" />
          </TableHandleRowMenuRoot>
        </TableHandleRowPopup>
      </TableHandleRowPositioner>
    </TableHandleRoot>
  );
}

function TableActions(props: { kind: "row" | "column" }) {
  const actions = useEditorDerivedValue((editor: Editor<AppExtension>) => {
    const commands = editor.commands;

    const entries =
      props.kind === "row"
        ? [
            { label: "Insert row above", command: commands.addTableRowAbove },
            { label: "Insert row below", command: commands.addTableRowBelow },
            { label: "Delete row", command: commands.deleteTableRow },
          ]
        : [
            { label: "Insert column left", command: commands.addTableColumnBefore },
            { label: "Insert column right", command: commands.addTableColumnAfter },
            { label: "Delete column", command: commands.deleteTableColumn },
          ];

    return [...entries, { label: "Delete table", command: commands.deleteTable }].map((entry) => ({
      ...entry,
      disabled: !entry.command.canExec(),
    }));
  });

  return (
    <MenuPositioner class="z-50 block">
      <MenuPopup class={cx(commandSurfaceClass, "flex min-w-40 flex-col border p-1 shadow-md")}>
        <For each={actions()}>
          {(action) => (
            <MenuItem
              class={cx(commandItemBaseClass, "data-highlighted:bg-control-hover")}
              disabled={action.disabled}
              onSelect={action.command}
            >
              {action.label}
            </MenuItem>
          )}
        </For>
      </MenuPopup>
    </MenuPositioner>
  );
}
