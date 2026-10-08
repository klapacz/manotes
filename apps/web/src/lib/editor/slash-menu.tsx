import { useEditor, useEditorDerivedValue } from "prosekit/solid";
import { findTable } from "prosekit/extensions/table";
import {
  AutocompleteItem,
  AutocompleteEmpty,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from "prosekit/solid/autocomplete";
import { createSignal, For, type JSX } from "solid-js";
import type { AppExtension } from "../../editor.extension";
import {
  commandItemBaseClass,
  commandEmptyClass,
  commandListClass,
  commandSurfaceClass,
} from "../../components/ui/command";
import { cx } from "../cva";
import { useArrowKeyAliases } from "./autocomplete";

const SLASH_REGEX = /^\/(\w*)$/u;

export function SlashMenu(): JSX.Element {
  const editor = useEditor<AppExtension>();
  const [query, setQuery] = createSignal("");
  const [isOpen, setOpen] = createSignal(false);
  useArrowKeyAliases(editor, isOpen);

  const canInsert = useEditorDerivedValue<AppExtension, boolean>(
    ({ state, commands }) =>
      !findTable(state.selection.$from) && commands.insertTable.canExec({ row: 3, col: 3 }),
  );

  const insert = () => {
    // Autocomplete deletes its match after selection, before inserting the table.
    queueMicrotask(() => {
      editor().view.focus();
      editor().commands.insertTable({ row: 3, col: 3 });
    });
  };

  return (
    <AutocompleteRoot
      regex={SLASH_REGEX}
      filter={() => true}
      onOpenChange={(event) => setOpen(event.detail)}
      onQueryChange={(event) => setQuery(event.detail)}
    >
      <AutocompletePositioner class="z-50 block">
        <AutocompletePopup
          class={cx(commandSurfaceClass, commandListClass, "block w-56 border p-1 shadow-md")}
        >
          <AutocompleteEmpty class={commandEmptyClass}>No matching commands</AutocompleteEmpty>
          <For each={canInsert() && "table".startsWith(query()) ? ["table"] : []}>
            {(value) => (
              <AutocompleteItem
                class={cx(
                  commandItemBaseClass,
                  "data-highlighted:bg-control-hover data-highlighted:text-fg",
                )}
                value={value}
                onSelect={insert}
              >
                Table
              </AutocompleteItem>
            )}
          </For>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  );
}
