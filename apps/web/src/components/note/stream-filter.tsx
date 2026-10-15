// Adapted from bazza/ui filter-selector.tsx at fe486a6a2ee1779482c0696b5a7008de6039983b.
// Source: https://github.com/bazzalabs/ui/tree/fe486a6a2ee1779482c0696b5a7008de6039983b/apps/web/registry/data-table-filter/components
// Why: searchable filter menus and segmented pills. Ported to Solid/Kobalte with
// Manotes stream filters and bounded repository search.
import { For, Show, Switch, Match, createMemo, createSignal, type JSX } from "solid-js";
import { Data, Match as EffectMatch, Option, Predicate, Record, Stream } from "effect";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { StreamPropFilter } from "./stream-prop-filter";
import type { NoteRepo } from "../../lib";
import { NoteLink } from "../../lib/note/link-component";
import { DateSuggestions } from "../../lib/date-suggestions";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { NoteQuery } from "./note-query";
import { NoteLabel } from "./note-label";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { FilterPill } from "../ui/filter-pill";
import { Command, CommandItem, CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { DateCommand } from "./date-command";
import { FilterIcon, RetryIcon, ArrowUpRightIcon } from "../icons";

type Filter = StreamSettings.Filter;

export type Field = Data.TaggedEnum<{
  type: {};
  // Menu navigation only; the chosen parent is stored inside filter.type.
  enumParent: {};
  search: {};
  date: {};
  backlinksTo: {};
  linksFrom: {};
  prop: { propId: AttrsSchema.NoteId };
}>;

export const Field = Data.taggedEnum<Field>();

const fields = [
  { value: "type", label: "Type", field: Field.type() },
  { value: "search", label: "Search", field: Field.search() },
  { value: "date", label: "Date", field: Field.date() },
  { value: "backlinksTo", label: "Links to", field: Field.backlinksTo() },
  { value: "linksFrom", label: "Links from", field: Field.linksFrom() },
] as const;

export type StreamFilterMenu = { open: boolean; field: Field | undefined; search?: string };

// Enum options need a parent, so their type is constructed after the second picker.
const typeChoices = Record.collect(StreamSettings.typeLabels, (value, label) => {
  if (value === "enum_option") return [];

  return [{ value, label, type: PaneSchema.StreamFilterType.cases[value].make({}) }];
}).flat();

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

  const propertyFilters = StreamPropFilter.use({
    filter: () => props.filter,
    propId: () => {
      const field = selectedField();

      return field && Field.$is("prop")(field) ? field.propId : undefined;
    },
    onChange: (filter) => props.onChange(filter),
  });

  // Keep the submenu heading reactive when navigation or a property definition changes.
  const selectedLabel = createMemo(() => {
    // Property fields carry an ID; their label comes from the live definitions query.
    const property = propertyFilters.selected();

    if (property) return property.label;

    const field = selectedField();

    if (!field) return;

    // The parent chooser is nested under Type and has no entry in the top-level fields list.
    if (Field.$is("enumParent")(field)) return "Enum options";

    return fields.find((item) => item.value === field._tag)?.label;
  });

  const open = (field: Field | undefined, search?: string) => {
    return props.onMenuChange({ open: true, field, search });
  };

  const changedFields = createMemo(() => StreamSettings.changedFilters(props.filter));
  const hasCondition = (field: StreamSettings.FilterField) => changedFields().includes(field);

  const changed = () => changedFields().length > 0 || propertyFilters.modified();

  const clear = (field: StreamSettings.FilterField, close: () => void) => {
    return hasCondition(field)
      ? () => {
          props.onChange(StreamSettings.clearFilter(props.filter, field));
          close();
        }
      : undefined;
  };

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

            if (!field || !(Field.$is("backlinksTo")(field) || Field.$is("linksFrom")(field))) {
              return;
            }

            const key = field._tag;

            return {
              query: noteQueries[key],
              value: props.filter[key],
              onClear: clear(key, close),
            };
          });

          const types = MenuQuery.choices<MenuQuery.Action>(() => {
            return [
              ...typeChoices.map((choice) => ({
                ...choice,
                run: () => setType(choice.type, close),
              })),
              {
                value: "enum_option",
                label: StreamSettings.typeLabels.enum_option,
                suffix: <Picker.Caret />,
                run: () => open(Field.enumParent()),
              },
            ];
          });

          // Replace the query when definitions change so an open parent picker updates too.
          const enumParents = createMemo(() => {
            const choices = propertyFilters.enums().map((entry) => ({
              value: entry.id,
              label: entry.label,
              run: () => {
                return setType(
                  PaneSchema.StreamFilterType.cases.enum_option.make({ enum_parent: entry.id }),
                  close,
                );
              },
            }));

            return MenuQuery.choices(() => choices);
          });

          const dates = QueryEngine.map(DateSuggestions.query, (date) => ({
            value: date.id,
            label: date.title,
            run: () => setDate(date.id, close),
          }));

          const actions = createMemo((): readonly MenuQuery.Action[] => {
            return fields.map((field) => ({
              ...field,
              keywords: field.value === "date" ? ["calendar"] : [],
              suffix: <Picker.Caret />,
              modified: hasCondition(field.value),
              detail:
                field.value === "type" || hasCondition(field.value)
                  ? () => <FilterValue field={field.value} filter={props.filter} />
                  : undefined,
              run: (search) => open(field.field, search),
            }));
          });

          const query = createMemo(() => {
            const choices = actions();

            const builtins = QueryEngine.combine([
              MenuQuery.actions(() => choices),
              MenuQuery.nested({ label: "Type", query: types }),
              // Share the parent choices with top-level search, bypassing submenu navigation.
              MenuQuery.nested({ label: "Enum options", query: enumParents() }),
              MenuQuery.nested({ label: "Date", query: dates }),
              MenuQuery.nested({ label: "Links to", query: noteQueries.backlinksTo }),
              MenuQuery.nested({ label: "Links from", query: noteQueries.linksFrom }),
              MenuQuery.nested({ label: "Open note", query: noteQueries.openNote }),
            ]);

            const properties = StreamPropFilter.query({
              entries: propertyFilters.entries(),
              onOpen: (propId, search) => open(Field.prop({ propId }), search),
              onSet: (propId, value) => propertyFilters.set({ propId, value, close }),
            });

            return (request: QueryEngine.Request) => {
              return Stream.zipLatestAll(builtins(request), properties(request)).pipe(
                Stream.map(([builtins, properties]) => [...builtins, ...properties]),
              );
            };
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
                            props.onChange(
                              StreamSettings.defaults(
                                PaneSchema.StreamFilterType.cases.notes.make({}),
                              ).filter,
                            );
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
                    {selectedLabel()}
                  </div>
                  <Switch>
                    <Match when={propertyFilters.selected()}>
                      {(prop) => (
                        <StreamPropFilter.Menu
                          entry={prop()}
                          search={props.menu.search}
                          onChange={(value) => {
                            return propertyFilters.set({ propId: prop().id, value, close });
                          }}
                          onBack={() => open(undefined)}
                          onOpenNote={(id) => close(() => props.onOpenNote(id))}
                          onClear={() => {
                            return propertyFilters.set({
                              propId: prop().id,
                              value: undefined,
                              close,
                            });
                          }}
                        />
                      )}
                    </Match>
                    <Match when={Field.$is("type")(field())}>
                      <Picker.Query
                        label="Search types"
                        query={types}
                        initialSearch={props.menu.search}
                        selected={props.filter.type._tag}
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
                    <Match when={Field.$is("enumParent")(field())}>
                      <Picker.Query
                        label="Search enums"
                        query={enumParents()}
                        initialSearch={props.menu.search}
                        selected={
                          Predicate.isTagged(props.filter.type, "enum_option")
                            ? props.filter.type.enum_parent
                            : undefined
                        }
                        onSelect={(choice) => choice.run()}
                      >
                        {(items) => (
                          <CommandList>
                            <CommandScroll>{items}</CommandScroll>
                            <Picker.Footer>
                              <Picker.Back onSelect={() => open(Field.type())} />
                              <Picker.Clear onSelect={clear("type", close)} />
                            </Picker.Footer>
                          </CommandList>
                        )}
                      </Picker.Query>
                    </Match>
                    <Match when={Field.$is("search")(field())}>
                      <SearchPicker
                        value={props.filter.search}
                        initialSearch={props.menu.search}
                        onChange={setSearch}
                        onApply={close}
                        onBack={() => open(undefined)}
                        onClear={clear("search", close)}
                      />
                    </Match>
                    <Match when={Field.$is("date")(field())}>
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
    <>
      <For each={fields.filter((field) => hasCondition(field.value))}>
        {(field) => (
          <FilterPill.Root
            label={field.label}
            operator={EffectMatch.value(field.value).pipe(
              EffectMatch.when("type", () => "is"),
              EffectMatch.when("search", () => "contains"),
              EffectMatch.orElse(() => undefined),
            )}
            onClear={() => {
              props.onChange(StreamSettings.clearFilter(props.filter, field.value));
            }}
          >
            <FilterPill.Value
              aria-label={`Change ${field.label.toLowerCase()} filter`}
              onClick={() => open(field.field)}
            >
              <FilterValue field={field.value} filter={props.filter} />
            </FilterPill.Value>
            <Show
              when={
                (field.value === "backlinksTo" || field.value === "linksFrom") &&
                props.filter[field.value]
              }
            >
              {(id) => (
                <FilterPill.Action
                  as={NoteLink}
                  id={id()}
                  aria-label={`Open ${field.label.toLowerCase()} note`}
                  title="Open note"
                >
                  <ArrowUpRightIcon />
                </FilterPill.Action>
              )}
            </Show>
          </FilterPill.Root>
        )}
      </For>
      <For each={propertyFilters.entries().filter((entry) => entry.showChip)}>
        {(entry) => (
          <FilterPill.Root
            label={entry.label}
            operator="is"
            onClear={() => propertyFilters.set({ propId: entry.id, value: undefined })}
          >
            <FilterPill.Value
              aria-label={`Change ${entry.label} filter`}
              onClick={() => open(Field.prop({ propId: entry.id }))}
            >
              <StreamPropFilter.ValueLabel entry={entry} />
            </FilterPill.Value>
            <Show
              when={Option.getOrUndefined(
                entry.value.pipe(Option.filter(AttrsSchema.PropVal.guards.link)),
              )}
            >
              {(value) => (
                <FilterPill.Action
                  as={NoteLink}
                  id={value().val}
                  aria-label={`Open ${entry.label} reference`}
                  title="Open note"
                >
                  <ArrowUpRightIcon />
                </FilterPill.Action>
              )}
            </Show>
          </FilterPill.Root>
        )}
      </For>
    </>
  );

  const hasFilters = () => {
    return changedFields().length > 0 || propertyFilters.entries().some((entry) => entry.showChip);
  };

  return props.children(trigger, filters, hasFilters);
}

function FilterValue(props: { field: StreamSettings.FilterField; filter: Filter }) {
  // Include the parent's live label to distinguish streams for different enums.
  const enumParent = () => {
    return EffectMatch.value(props.filter.type).pipe(
      EffectMatch.tag("enum_option", ({ enum_parent }) => enum_parent),
      EffectMatch.orElse(() => undefined),
    );
  };

  return (
    <Switch>
      <Match when={props.field === "type"}>
        {StreamSettings.typeLabels[props.filter.type._tag]}
        <Show when={enumParent()}>
          {(id) => (
            <>
              {" "}
              · <NoteLabel.Root id={id()} />
            </>
          )}
        </Show>
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
        {(id) => <NoteLabel.Root id={id()} />}
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
          <Picker.Apply
            onSelect={() => {
              props.onChange(text());
              props.onApply();
            }}
          />
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
      initialSearch={props.search}
      onChange={props.onChange}
      onBack={props.onBack}
      onClear={props.onClear}
    />
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
