/**
 * Only the public API was checked. The implementation has not been carefully reviewed.
 * AI agents must notify the user of this review gap before working on this file.
 * @module
 */
import type { RecordRepo } from "@manotes/shared/record.repo";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Filters } from "@manotes/shared/record/filters";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Array, Equal, Match, Option, Predicate, Result, Stream } from "effect";
import { Show, createMemo, createSignal, type JSX } from "solid-js";
import { DateSuggestions } from "../../lib/date-suggestions";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { createFilterLabels } from "../../lib/filters";
import { Picker } from "../ui/picker";
import { SelectedIcon } from "../icons";
import { CommandList, CommandScroll } from "../ui/command";
import type { ButtonProps } from "../ui/button";
import { RecordQuery } from "./record-query";
import { PropQuery } from "./prop-query";

export type FilterMenu = { open: boolean; body?: boolean };

export function FilterLabel(props: { label: Filters.DisplayLabel }) {
  const text = createFilterLabels(() => [props.label]);

  return (
    <span class="min-w-0 truncate" title={text()[0]}>
      {text()[0]}
    </span>
  );
}

export function FilterPicker(props: {
  label: string;
  filters: Filters.Registry;
  value?: AttrsSchema.FilterExpr;
  siblings?: AttrsSchema.Filter;
  menu?: FilterMenu;
  onMenuChange?: (menu: FilterMenu) => void;
  onSelect: (expression: AttrsSchema.FilterExpr) => void;
  onPreset?: (settings: StreamSettings.Settings) => void;
  onClose?: () => void;
  children: JSX.Element;
  class?: string;
  variant?: ButtonProps["variant"];
  title?: string;
  triggerRef?: (button: HTMLButtonElement) => void;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = createSignal(props.initiallyOpen ?? false);

  return (
    <Picker.Root
      label={props.label}
      open={props.menu?.open ?? open()}
      onOpenChange={(open) => {
        setOpen(open);
        props.onMenuChange?.({ open });
      }}
    >
      <Picker.Trigger
        ref={props.triggerRef}
        class={props.class}
        variant={props.variant}
        title={props.title}
      >
        {props.children}
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
          <FilterCommands
            filters={props.filters}
            value={props.value}
            siblings={props.siblings}
            body={props.menu?.body}
            onSelect={(expression) => {
              props.onSelect(expression);
              close();
            }}
            onPreset={
              props.onPreset
                ? (settings) => {
                    props.onPreset?.(settings);
                    close();
                  }
                : undefined
            }
          />
        )}
      </Picker.Content>
    </Picker.Root>
  );
}

function FilterCommands(props: {
  filters: Filters.Registry;
  value?: AttrsSchema.FilterExpr;
  siblings?: AttrsSchema.Filter;
  body?: boolean;
  onSelect: (expression: AttrsSchema.FilterExpr) => void;
  onPreset?: (settings: StreamSettings.Settings) => void;
}) {
  const [group, setGroup] = createSignal(
    props.value
      ? Option.getOrUndefined(props.filters.findGroup(props.value))
      : props.body
        ? Option.getOrUndefined(props.filters.findGroup(Filters.body.make("")))
        : undefined,
  );

  const [groupSearch, setGroupSearch] = createSignal<string>();
  const [preset, setPreset] = createSignal(false);
  const labels = createFilterLabels(() => props.filters.groups.map((group) => group.label));

  const currentExpressions = createMemo(() => {
    return Array.map(props.siblings ?? [], (expression) => ({
      expression,
      group: Option.getOrUndefined(props.filters.findGroup(expression)),
      label: props.filters.getLabel(expression),
    }));
  });

  const query = createMemo(() => {
    const groups = props.filters.groups;
    const names = labels();

    const actions: readonly MenuQuery.Action[] = [
      ...groups.map((group, index) => {
        const current = Array.filterMap(currentExpressions(), (current) => {
          return current.group === group
            ? Result.fromOption(current.label, () => undefined)
            : Result.fail(undefined);
        });

        return {
          value: String(index),
          label: names[index] ?? Filters.renderLabel(group.label),
          suffix: <Picker.Caret />,
          detail: current.length
            ? () => (
                <FilterLabel
                  label={Filters.Label.Parts({
                    val: Array.flatMap(current, (label, i) => {
                      return i ? [Filters.Label.Literal({ val: ", " }), label] : [label];
                    }),
                  })}
                />
              )
            : undefined,
          run: (search?: string) => {
            setGroupSearch(search);
            setGroup(group);
          },
        };
      }),
      {
        value: "and",
        label: "AND group",
        run: () => props.onSelect(AttrsSchema.makeFilterExpr.and({ val: [] })),
      },
      {
        value: "or",
        label: "OR group",
        run: () => props.onSelect(AttrsSchema.makeFilterExpr.or({ val: [] })),
      },
      ...(props.onPreset
        ? [
            {
              value: "preset",
              label: "Preset",
              suffix: <Picker.Caret />,
              run: () => setPreset(true),
            },
          ]
        : []),
    ];

    return QueryEngine.combine([
      MenuQuery.actions(() => actions),
      ...groups.map((group, groupIndex) => {
        return MenuQuery.nested({
          label: names[groupIndex] ?? Filters.renderLabel(group.label),
          query: QueryEngine.map(
            QueryEngine.combine(
              group.entries.map((entry, index) => entryQuery(entry, index, props.value)),
            ),
            (choice): MenuQuery.Action => ({
              ...choice,
              value: `${groupIndex}:${choice.value}`,
              group: undefined,
              groupLabel: undefined,
              run: () => props.onSelect(choice.expression),
            }),
          ),
        });
      }),
    ]);
  });

  const currentValue = () => {
    if (props.value) return props.value;
    const selected = group();

    const current = Array.filter(currentExpressions(), (current) => current.group === selected);

    return current.length === 1 ? current[0]?.expression : undefined;
  };

  return (
    <Show
      when={!preset()}
      fallback={
        <PresetCommands
          onSelect={(settings) => props.onPreset?.(settings)}
          onBack={() => setPreset(false)}
        />
      }
    >
      <Show
        when={group()}
        fallback={
          <Picker.Query
            label="Search filters"
            query={query()}
            onSelect={(action) => action.run()}
          />
        }
      >
        {(group) => (
          <GroupCommands
            group={group()}
            search={groupSearch()}
            value={currentValue()}
            onSelect={props.onSelect}
            onBack={() => setGroup(undefined)}
          />
        )}
      </Show>
    </Show>
  );
}

type Choice = Picker.Choice & { expression: AttrsSchema.TargetFilterExpr };

type Candidate = Picker.Choice & { raw: Filters.PickerValue };

function GroupCommands(props: {
  group: Filters.Group;
  search?: string;
  value?: AttrsSchema.FilterExpr;
  onSelect: (expression: AttrsSchema.FilterExpr) => void;
  onBack: () => void;
}) {
  const labels = createFilterLabels(() => {
    return [
      props.group.label,
      ...props.group.entries.map((entry) => entry.picker?.label ?? props.group.label),
    ];
  });

  const [parameter, setParameter] = createSignal<{ entry: Filters.Named; search: string }>();

  const current = () => {
    return props.value
      ? Array.findFirst(props.group.entries, (entry) => {
          return Option.isSome(entry.selection(props.value!));
        })
      : Option.none();
  };

  const initialSearch = () => {
    return Option.match(current(), {
      onNone: () => undefined,
      onSome: (entry) => {
        const value = Option.getOrUndefined(entry.selection(props.value!));

        return entry.picker &&
          ["Text", "Number", "Date"].includes(entry.picker._tag) &&
          value !== undefined
          ? String(value)
          : undefined;
      },
    });
  };

  const query = createMemo(() => {
    const queries: QueryEngine.Query<Choice | MenuQuery.Action, unknown, RecordRepo.Service>[] =
      props.group.entries.map((entry, index) => {
        if (Predicate.isTagged(entry, "Named") && entry.picker && props.group.entries.length > 1) {
          const label = labels()[index + 1] ?? Filters.renderLabel(entry.picker.label);

          return (request) => {
            return Stream.succeed([
              {
                score: 1,
                value: {
                  value: `parameter:${index}`,
                  label,
                  suffix: <Picker.Caret />,
                  run: () => setParameter({ entry, search: request.text }),
                },
              },
            ]);
          };
        }

        return entryQuery(entry, index, props.value);
      });

    return (request: QueryEngine.Request) => {
      return Stream.zipLatestAll(
        ...queries.map((query, index) => {
          return query(
            props.group.entries[index]?.picker?._tag === "Choices" ? { text: "" } : request,
          );
        }),
      ).pipe(Stream.map(Array.flatten));
    };
  });

  return (
    <Show
      when={parameter()}
      fallback={
        <Picker.Query
          label={labels()[0] ?? "Filter values"}
          initialSearch={props.search ?? initialSearch()}
          query={query()}

          onSelect={(choice) => {
            if ("run" in choice) choice.run();
            else props.onSelect(choice.expression);
          }}
        >
          {(items) => (
            <CommandList>
              <CommandScroll>{items}</CommandScroll>
              <Picker.Footer>
                <Show when={props.value}>
                  {(value) => (
                    <div class="px-2 py-1.5 text-xs text-fg-subtle">
                      Current:{" "}
                      <FilterLabel
                        label={Option.getOrElse(
                          Array.findFirst(props.group.entries, (entry) => entry.getLabel(value())),
                          () => Filters.Label.Literal({ val: "Unavailable" }),
                        )}
                      />
                    </div>
                  )}
                </Show>
                <Picker.Back onSelect={props.onBack} />
              </Picker.Footer>
            </CommandList>
          )}
        </Picker.Query>
      }
    >
      {(parameter) => (
        <GroupCommands
          group={{ label: parameter().entry.picker!.label, entries: [parameter().entry] }}
          value={
            props.value && Option.isSome(parameter().entry.selection(props.value))
              ? props.value
              : undefined
          }
          search={parameter().search}
          onSelect={props.onSelect}
          onBack={() => setParameter(undefined)}
        />
      )}
    </Show>
  );
}

function entryQuery(
  entry: Filters.Definition,
  index: number,
  expression?: AttrsSchema.FilterExpr,
): QueryEngine.Query<Choice, unknown, RecordRepo.Service> {
  const selection = expression ? entry.selection(expression) : Option.none();

  if (!entry.picker) {
    return MenuQuery.choices(() => {
      return Option.toArray(
        Option.flatMap(entry.select(undefined), (expression) => {
          return Option.map(entry.getLabel(expression), (label) => ({
            value: String(index),
            label: Filters.renderLabel(label),
            expression,
            suffix: Option.isSome(selection) ? (
              <SelectedIcon aria-label="Selected" class="size-4" />
            ) : undefined,
          }));
        }),
      );
    });
  }

  const picker = entry.picker;

  const choice = (value: Filters.PickerValue, label: string): Candidate => ({
    value: `${index}:${JSON.stringify(value)}`,
    label,
    raw: value,
    detail:
      picker.defaultValue !== undefined && Equal.equals(picker.defaultValue, value)
        ? () => "Default"
        : undefined,
    suffix: Option.contains(selection, value) ? (
      <SelectedIcon aria-label="Selected" class="size-4" />
    ) : undefined,
  });

  const query: QueryEngine.Query<Candidate, unknown, RecordRepo.Service> = Match.value(picker).pipe(
    Match.tag("Choices", ({ groups }) => {
      const query = MenuQuery.choices(() => {
        return groups.flatMap((group) => {
          return group.choices.map((item) => ({
            ...choice(item.value, item.label),
            group: `${index}:${group.label}`,
            groupLabel: () => group.label,
          }));
        });
      });

      return query;
    }),
    Match.tag("Record", ({ filter }) => {
      const query = filter.length ? RecordQuery.scoped({ filter }) : RecordQuery.query;

      return QueryEngine.map(query, (record) => ({
        ...choice(record.value, record.label),
        group: String(index),
        groupLabel: () => <FilterLabel label={picker.label} />,
      }));
    }),
    Match.tag("Text", () => {
      return (request: QueryEngine.Request) => {
        return Stream.succeed([
          ...(request.text === "" &&
          Predicate.isString(picker.defaultValue) &&
          picker.defaultValue !== ""
            ? [{ score: 1, value: choice(picker.defaultValue, picker.defaultValue) }]
            : []),
          {
            score: 1,
            value: choice(request.text, request.text === "" ? 'Use empty text ""' : request.text),
          },
        ]);
      };
    }),
    Match.tag("Number", () => {
      return (request: QueryEngine.Request) => {
        return Stream.succeed(
          !request.text.trim() && Predicate.isNumber(picker.defaultValue)
            ? [{ score: 1, value: choice(picker.defaultValue, String(picker.defaultValue)) }]
            : Option.match(PropQuery.parseNumber(request.text), {
                onNone: () => [],
                onSome: ({ val }) => [{ score: 1, value: choice(val, String(val)) }],
              }),
        );
      };
    }),
    Match.tag("Date", () => {
      return QueryEngine.map(DateSuggestions.query, (date) => choice(date.id, date.title));
    }),
    Match.exhaustive,
  );

  return (request) => {
    return query(request).pipe(
      Stream.map((matches) => {
        return Array.filterMap(matches, (match) => {
          return Result.fromOption(
            Option.map(entry.select(match.value.raw), (expression) => ({
              ...match,
              value: { ...match.value, expression },
            })),
            () => undefined,
          );
        });
      }),
    );
  };
}

function PresetCommands(props: {
  onSelect: (settings: StreamSettings.Settings) => void;
  onBack: () => void;
}) {
  const [enumParent, setEnumParent] = createSignal(false);
  const picker = Filters.enumOptions.picker;

  // TODO: Generate preset choices from shared definitions instead of hardcoding them here.
  const query = MenuQuery.actions(() => {
    return [
      {
        value: "notes",
        label: "Notes preset",
        run: () => props.onSelect(StreamSettings.presets.notes),
      },
      {
        value: "pages",
        label: "Pages preset",
        run: () => props.onSelect(StreamSettings.presets.pages),
      },
      {
        value: "enum",
        label: "Enum options preset",
        suffix: <Picker.Caret />,
        run: () => setEnumParent(true),
      },
    ];
  });

  return (
    <Show
      when={enumParent()}
      fallback={
        <Picker.Query label="Choose preset" query={query} onSelect={(action) => action.run()}>
          {(items) => (
            <CommandList>
              <CommandScroll>{items}</CommandScroll>
              <Picker.Footer>
                <Picker.Back onSelect={props.onBack} />
              </Picker.Footer>
            </CommandList>
          )}
        </Picker.Query>
      }
    >
      <Picker.Query
        label="Enum options preset of"
        query={RecordQuery.scoped({
          filter: Predicate.isTagged(picker, "Record") ? picker.filter : [],
        })}
        onSelect={(record) => props.onSelect(StreamSettings.enumOptionsPreset(record.value))}
      >
        {(items) => (
          <CommandList>
            <CommandScroll>{items}</CommandScroll>
            <Picker.Footer>
              <Picker.Back onSelect={() => setEnumParent(false)} />
            </Picker.Footer>
          </CommandList>
        )}
      </Picker.Query>
    </Show>
  );
}
