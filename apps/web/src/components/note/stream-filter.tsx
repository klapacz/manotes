// Adapted from bazza/ui filter-selector.tsx at fe486a6a2ee1779482c0696b5a7008de6039983b.
// Source: https://github.com/bazzalabs/ui/tree/fe486a6a2ee1779482c0696b5a7008de6039983b/apps/web/registry/data-table-filter/components
// Why: searchable filter menus and segmented pills. Ported to Solid/Kobalte with
// Manotes stream filters and bounded repository search.
import { For, Show, Switch, Match, createMemo, createSignal, type JSX } from "solid-js";
import { Option, Stream } from "effect";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { NoteRepo, bindRt, createAtomStore, createSyncedAtom } from "../../lib";
import { NoteLink } from "../../lib/note/link-component";
import { DateSuggestions } from "../../lib/date-suggestions";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { NoteQuery } from "./note-query";
import { Button } from "../ui/button";
import { Command, CommandItem, CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { DateCommand } from "./date-command";
import { FilterIcon, XIcon, RetryIcon, ApplyIcon, ArrowUpRightIcon } from "../icons";

type Filter = StreamSettings.Filter;

const fields = [
  { value: "type", label: "Type" },
  { value: "search", label: "Search" },
  { value: "date", label: "Date" },
  { value: "backlinksTo", label: "Links to" },
  { value: "linksFrom", label: "Links from" },
] as const;

type Field = (typeof fields)[number]["value"];

export type StreamFilterMenu = { open: boolean; field: Field | undefined; search?: string };

const typeChoices = [
  { value: "notes", label: "Notes" },
  { value: "pages", label: "Pages" },
] as const;

export function StreamFilterEditor(props: {
  filter: Filter;
  onChange: (filter: Filter, replace?: boolean) => void;
  menu: StreamFilterMenu;
  onMenuChange: (menu: StreamFilterMenu) => void;
  onClose: () => void;
  onOpenNote: (id: string) => void;
  children: (trigger: JSX.Element, filters: JSX.Element, hasFilters: () => boolean) => JSX.Element;
}) {
  const selectedField = () => props.menu.field;

  const open = (field: Field | undefined, search?: string) =>
    props.onMenuChange({ open: true, field, search });

  const changedFields = createMemo(() => StreamSettings.changedFilters(props.filter));
  const hasCondition = (field: Field) => changedFields().includes(field);
  const changed = () => changedFields().length > 0;

  const clear = (field: Field, close: () => void) =>
    hasCondition(field)
      ? () => {
          props.onChange(StreamSettings.clearFilter(props.filter, field));
          close();
        }
      : undefined;

  const setSearch = (search: string) => {
    const value = search.trim() || undefined;

    if (value !== props.filter.search) props.onChange({ ...props.filter, search: value }, true);
  };

  const setType = (type: Filter["type"], close: () => void) => {
    props.onChange({ ...props.filter, type });
    close();
  };

  const setDate = (date: string, close: () => void) => {
    props.onChange({ ...props.filter, date });
    close();
  };

  const trigger = (
    <Picker.Root
      label="Filter stream"
      open={props.menu.open}
      onOpenChange={(next) => {
        // Keep the current submenu mounted during the closing animation.
        props.onMenuChange({ open: next, field: next ? undefined : props.menu.field });
      }}
      placement="left-start"
      getAnchorRect={(anchor) => {
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();

        return {
          x: anchor.closest("section")?.getBoundingClientRect().left ?? rect.left,
          y: rect.top,
          width: 0,
          height: rect.height,
        };
      }}
    >
      <Picker.Trigger title="Filter (F)" size="icon-xs" rounded="full" modified={changed()}>
        <FilterIcon />
      </Picker.Trigger>
      <Picker.Content
        class="md:w-64"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          props.onClose();
        }}
      >
        {(close) => {
          const notes = NoteQuery.query;

          const noteQueries = {
            backlinksTo: QueryEngine.map(notes, (note): MenuQuery.Action => ({
              ...note,
              run: () => {
                props.onChange({ ...props.filter, backlinksTo: note.value });
                close();
              },
            })),
            linksFrom: QueryEngine.map(notes, (note): MenuQuery.Action => ({
              ...note,
              run: () => {
                props.onChange({ ...props.filter, linksFrom: note.value });
                close();
              },
            })),
            openNote: QueryEngine.map(notes, (note): MenuQuery.Action => ({
              ...note,
              run: () => close(() => props.onOpenNote(note.value)),
            })),
          };

          const notePicker = createMemo(() => {
            const field = selectedField();

            if (field !== "backlinksTo" && field !== "linksFrom") return;

            return {
              query: noteQueries[field],
              value: props.filter[field],
              onClear: clear(field, close),
            };
          });

          const types = MenuQuery.choices(() =>
            typeChoices.map((choice) => ({
              ...choice,
              run: () => setType(choice.value, close),
            })),
          );

          const dates = QueryEngine.map(DateSuggestions.query, (date) => ({
            value: date.id,
            label: date.title,
            run: () => setDate(date.id, close),
          }));

          const actions = createMemo((): readonly MenuQuery.Action[] =>
            fields.map((field) => ({
              ...field,
              keywords: field.value === "date" ? ["calendar"] : [],
              suffix: <Picker.Caret />,
              modified: hasCondition(field.value),
              detail:
                field.value === "type" || hasCondition(field.value)
                  ? () => <FilterValue field={field.value} filter={props.filter} />
                  : undefined,
              run: (search) => open(field.value, search),
            })),
          );

          const query = createMemo(() => {
            const choices = actions();

            return QueryEngine.combine([
              MenuQuery.actions(() => choices),
              MenuQuery.nested({ label: "Type", query: types }),
              MenuQuery.nested({ label: "Date", query: dates }),
              MenuQuery.nested({ label: "Links to", query: noteQueries.backlinksTo }),
              MenuQuery.nested({ label: "Links from", query: noteQueries.linksFrom }),
              MenuQuery.nested({ label: "Open note", query: noteQueries.openNote }),
            ]);
          });

          return (
            <Show
              when={selectedField()}
              fallback={
                <Picker.Query
                  label="Search filters"
                  query={query()}
                  onSelect={(choice) => choice.run()}
                >
                  {(items) => (
                    <CommandList>
                      <CommandScroll>{items}</CommandScroll>
                      <Picker.Footer>
                        <CommandItem
                          value="reset"
                          disabled={!changed()}
                          onSelect={() => {
                            props.onChange(StreamSettings.defaults("notes").filter);
                            close();
                          }}
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
              {(field) => (
                <>
                  <div class="border-b border-border-subtle px-3 py-2 text-sm">
                    {fields.find((item) => item.value === field())?.label}
                  </div>
                  <Switch>
                    <Match when={field() === "type"}>
                      <Picker.Query
                        label="Search types"
                        query={types}
                        initialSearch={props.menu.search}
                        selected={props.filter.type}
                        onSelect={(choice) => choice.run()}
                      >
                        {(items) => (
                          <CommandList>
                            <CommandScroll>{items}</CommandScroll>
                            <Picker.Footer>
                              <Picker.Back onSelect={() => open(undefined)} />
                              <Picker.Clear onSelect={clear("type", close)} />
                            </Picker.Footer>
                          </CommandList>
                        )}
                      </Picker.Query>
                    </Match>
                    <Match when={field() === "search"}>
                      <SearchPicker
                        value={props.filter.search}
                        initialSearch={props.menu.search}
                        onChange={setSearch}
                        onApply={close}
                        onBack={() => open(undefined)}
                        onClear={clear("search", close)}
                      />
                    </Match>
                    <Match when={field() === "date"}>
                      <DateFilterPicker
                        value={props.filter.date}
                        search={props.menu.search}
                        onChange={(date) => setDate(date, close)}
                        onBack={() => open(undefined)}
                        onClear={clear("date", close)}
                      />
                    </Match>
                    <Match when={notePicker()}>
                      {(picker) => (
                        <NoteFilterPicker
                          query={picker().query}
                          value={picker().value}
                          search={props.menu.search}
                          onBack={() => open(undefined)}
                          onClear={picker().onClear}
                        />
                      )}
                    </Match>
                  </Switch>
                </>
              )}
            </Show>
          );
        }}
      </Picker.Content>
    </Picker.Root>
  );

  const filters = (
    <For each={fields.filter((field) => hasCondition(field.value))}>
      {(field) => (
        <FilterPill
          label={field.label}
          onClear={() => {
            props.onChange(StreamSettings.clearFilter(props.filter, field.value));
          }}
        >
          <Show when={field.value === "type" || field.value === "search"}>
            <span class="px-2 text-sm text-fg-subtle">
              {field.value === "type" ? "is" : "contains"}
            </span>
          </Show>
          <Button
            variant="ghost"
            size="chip"
            rounded="none"
            class="h-full min-w-0 max-w-48 px-2 text-sm font-normal"
            aria-label={`Change ${field.label.toLowerCase()} filter`}
            onClick={() => open(field.value)}
          >
            <span class="min-w-0 truncate">
              <FilterValue field={field.value} filter={props.filter} />
            </span>
          </Button>
          <Show
            when={
              (field.value === "backlinksTo" || field.value === "linksFrom") &&
              props.filter[field.value]
            }
          >
            {(id) => (
              <Button
                as={NoteLink}
                id={id()}
                variant="ghost"
                size="icon-xs"
                rounded="none"
                class="h-full text-fg-subtle"
                aria-label={`Open ${field.label.toLowerCase()} note`}
                title="Open note"
              >
                <ArrowUpRightIcon />
              </Button>
            )}
          </Show>
        </FilterPill>
      )}
    </For>
  );

  return props.children(trigger, filters, changed);
}

function FilterValue(props: { field: Field; filter: Filter }) {
  return (
    <Switch>
      <Match when={props.field === "type"}>
        {props.filter.type === "notes" ? "Notes" : "Pages"}
      </Match>
      <Match when={props.field === "search"}>{props.filter.search}</Match>
      <Match keyed when={props.field === "date" && props.filter.date}>
        {(date) => DateSuggestions.formatDate(date)}
      </Match>
      <Match
        when={
          (props.field === "backlinksTo" || props.field === "linksFrom") &&
          props.filter[props.field]
        }
      >
        {(id) => <NoteFilterLabel id={id()} />}
      </Match>
    </Switch>
  );
}

type PickerNavigation = { onBack: () => void; onClear?: () => void };

function SearchPicker(
  props: PickerNavigation & {
    value?: string;
    initialSearch?: string;
    onChange: (value: string) => void;
    onApply: () => void;
  },
) {
  // Keep spaces in the input while the applied query is normalized.
  const [text, setText] = createSignal(props.initialSearch ?? props.value ?? "");

  return (
    <Command shouldFilter={false}>
      <Picker.Input
        aria-label="Search this stream"
        placeholder="Search notes…"
        value={text()}
        onValueChange={(value) => {
          setText(value);
          props.onChange(value);
        }}
      />
      <CommandList>
        <CommandScroll>
          <CommandItem
            value="apply"
            onSelect={() => {
              props.onChange(text());
              props.onApply();
            }}
          >
            <ApplyIcon />
            Apply
          </CommandItem>
        </CommandScroll>
        <Picker.Footer>
          <Picker.Back onSelect={props.onBack} />
          <Picker.Clear onSelect={props.onClear} />
        </Picker.Footer>
      </CommandList>
    </Command>
  );
}

function DateFilterPicker(
  props: PickerNavigation & { value?: string; search?: string; onChange: (date: string) => void },
) {
  return (
    <DateCommand.Root
      label="Filter by date"
      value={props.value}
      initialText={props.value ? DateSuggestions.formatDate(props.value) : ""}
      initialSearch={props.search}
      onChange={props.onChange}
      onBack={props.onBack}
    >
      <Picker.Clear onSelect={props.onClear} />
    </DateCommand.Root>
  );
}

function NoteFilterPicker(
  props: PickerNavigation & {
    value?: string;
    search?: string;
    query: QueryEngine.Query<MenuQuery.Action, unknown, NoteRepo.Service>;
  },
) {
  return (
    <Picker.Query
      label="Search notes and pages"
      query={props.query}
      initialSearch={props.search}
      selected={props.value}
      onSelect={(choice) => choice.run()}
    >
      {(items) => (
        <CommandList>
          <CommandScroll>{items}</CommandScroll>
          <Picker.Footer>
            <Picker.Back onSelect={props.onBack} />
            <Picker.Clear onSelect={props.onClear} />
          </Picker.Footer>
        </CommandList>
      )}
    </Picker.Query>
  );
}

function NoteFilterLabel(props: { id: string }) {
  const idAtom = createSyncedAtom(() => props.id);

  const note = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) =>
        NoteRepo.Service.use((repo) => repo.reactiveFindPreviewById(get(idAtom))).pipe(
          Stream.unwrap,
          Stream.map((value) => ({ note: Option.getOrNull(value) })),
        ),
      ),
    ),
    { note: null },
  );

  const label = () => (note.value.note ? NoteQuery.label(note.value.note) : "Unavailable note");

  return (
    <span class="truncate" title={label()}>
      {label()}
    </span>
  );
}

function FilterPill(props: { label: string; onClear: () => void; children: JSX.Element }) {
  return (
    <div class="flex h-7 shrink-0 items-center divide-x divide-border-subtle overflow-hidden rounded-full border border-border-subtle bg-bg text-sm shadow-xs">
      <span class="max-w-40 truncate px-2" title={props.label}>
        {props.label}
      </span>
      {props.children}
      <Button
        variant="ghost"
        size="icon-xs"
        rounded="none"
        class="h-full text-fg-subtle"
        aria-label={`Clear ${props.label} filter`}
        onClick={props.onClear}
      >
        <XIcon />
      </Button>
    </div>
  );
}
