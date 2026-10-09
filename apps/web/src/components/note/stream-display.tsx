import { createMemo, createSignal, Show } from "solid-js";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { Picker } from "../ui/picker";
import { CommandItem, CommandList, CommandScroll } from "../ui/command";
import { DisplaySettingsIcon, RetryIcon } from "../icons";
import { Focus } from "./focus";

const sortChoices = [
  { value: "date", label: "Date" },
  { value: "updated", label: "Updated" },
] as const;

const viewChoices = [
  { value: "full", label: "Full" },
  { value: "snippets", label: "Snippets" },
] as const;

export function Menu(props: {
  settings: StreamSettings.Settings;
  onChange: (display: StreamSettings.Display) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [setting, setSetting] = createSignal<keyof StreamSettings.Display>();
  const changed = createMemo(() => StreamSettings.changedDisplay(props.settings));

  const changeOpen = (open: boolean) => {
    if (open) setSetting(undefined);
    setOpen(open);
  };

  const changeDisplay = (display: StreamSettings.Display) => {
    props.onChange(display);
    changeOpen(false);
  };

  const resetDisplay = () => {
    const { sort, view } = StreamSettings.defaults(props.settings.filter.type);
    changeDisplay({ sort, view });
  };

  const changeSort = (sort: StreamSettings.Display["sort"]) =>
    changeDisplay({ sort, view: props.settings.view });

  const changeView = (view: StreamSettings.Display["view"]) =>
    changeDisplay({ sort: props.settings.sort, view });

  const sorts = MenuQuery.choices(() =>
    sortChoices.map((choice): MenuQuery.Action => ({
      ...choice,
      run: () => changeSort(choice.value),
    })),
  );

  const views = MenuQuery.choices(() =>
    viewChoices.map((choice): MenuQuery.Action => ({
      ...choice,
      run: () => changeView(choice.value),
    })),
  );

  const query = createMemo(() => {
    const settings = props.settings;
    const modified = changed();

    const actions: readonly MenuQuery.Action[] = [
      {
        value: "sort",
        label: "Sort",
        suffix: <Picker.Caret />,
        detail: () => (settings.sort === "date" ? "Date" : "Updated"),
        modified: modified.includes("sort"),
        run: () => setSetting("sort"),
      },
      {
        value: "view",
        label: "View",
        suffix: <Picker.Caret />,
        detail: () => (settings.view === "full" ? "Full" : "Snippets"),
        modified: modified.includes("view"),
        run: () => setSetting("view"),
      },
    ];

    return QueryEngine.combine([
      MenuQuery.choices(() => actions),
      MenuQuery.nested({ label: "Sort", query: sorts }),
      MenuQuery.nested({ label: "View", query: views }),
    ]);
  });

  Focus.useNode().registerShortcuts([
    {
      key: [["Shift+V"]],
      handler: () => {
        changeOpen(true);

        return true;
      },
    },
  ]);

  return (
    <Picker.Root label="Display settings" open={open()} onOpenChange={changeOpen}>
      <Picker.Trigger
        title="Display settings (Shift+V)"
        size="icon-xs"
        rounded="full"
        modified={changed().length > 0}
      >
        <DisplaySettingsIcon />
      </Picker.Trigger>
      <Picker.Content>
        {() => (
          <Show
            when={setting()}
            fallback={
              <Picker.Query
                label="Search display settings"
                query={query()}
                onSelect={(choice) => choice.run()}
              >
                {(items) => (
                  <CommandList>
                    <CommandScroll>{items}</CommandScroll>
                    <Picker.Footer>
                      <CommandItem
                        value="reset"
                        disabled={changed().length === 0}
                        onSelect={resetDisplay}
                      >
                        <RetryIcon />
                        Reset
                      </CommandItem>
                    </Picker.Footer>
                  </CommandList>
                )}
              </Picker.Query>
            }
          >
            {(setting) => (
              <Picker.Query
                label={setting() === "sort" ? "Sort" : "View"}
                query={setting() === "sort" ? sorts : views}
                selected={setting() === "sort" ? props.settings.sort : props.settings.view}
                onSelect={(choice) => choice.run()}
              >
                {(items) => (
                  <CommandList>
                    <CommandScroll>{items}</CommandScroll>
                    <Picker.Footer>
                      <Picker.Back onSelect={() => setSetting(undefined)} />
                    </Picker.Footer>
                  </CommandList>
                )}
              </Picker.Query>
            )}
          </Show>
        )}
      </Picker.Content>
    </Picker.Root>
  );
}

export * as StreamDisplay from "./stream-display";
