import type { JSX } from "@solidjs/web";
/**
 * Only the public API was checked. The implementation has not been carefully reviewed.
 * AI agents must notify the user of this review gap before working on this file.
 * @module
 */
import type { RecordRepo } from "@manotes/shared/record.repo";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Filters } from "@manotes/shared/record/filters";
import { Array, Equal, Match, Option, Predicate, Result, Stream } from "effect";
import { Show, createMemo, createSignal, untrack } from "solid-js";
import { CircleCheck, CircleDashed, CircleX } from "@lucide/solid";
import { DateSuggestions } from "../../lib/date-suggestions";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { createFilterLabels, resolveFilterLabels } from "../../lib/filters";
import type { RecordCache } from "../../lib/record-cache.service";
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
  onOpenRecord?: (id: AttrsSchema.RecordId) => void;
  onClear?: () => void;
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
            onOpenRecord={
              props.onOpenRecord ? (id) => close(() => props.onOpenRecord?.(id)) : undefined
            }
            onClear={props.onClear ? () => close(props.onClear) : undefined}
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
  onOpenRecord?: (id: AttrsSchema.RecordId) => void;
  onClear?: () => void;
}) {
  // Seed the initial subpage on mount only; FilterCommands unmounts after the
  // close animation, so deriving from props would blink back to the main page
  // while closing.
  const [group, setGroup] = createSignal(
    untrack(() => {
      return props.value
        ? Option.getOrUndefined(props.filters.findGroup(props.value))
        : props.body
          ? Option.getOrUndefined(props.filters.findGroup(Filters.body.make("")))
          : undefined;
    }),
  );

  const [groupSearch, setGroupSearch] = createSignal<string>();
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
    ];

    return QueryEngine.combine([
      MenuQuery.actions(() => actions),
      ...(props.onOpenRecord
        ? [
            MenuQuery.nested({
              label: "Open record",
              query: QueryEngine.map(RecordQuery.query, (record): MenuQuery.Action => ({
                ...record,
                run: () => props.onOpenRecord?.(record.value),
              })),
            }),
          ]
        : []),
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
      when={group()}
      fallback={
        <Picker.Query label="Search filters" query={query()} onSelect={(action) => action.run()}>
          {(items) => (
            <CommandList>
              <CommandScroll>{items}</CommandScroll>
              <Show when={props.onClear}>
                <Picker.Footer>
                  <Picker.Clear onSelect={props.onClear} />
                </Picker.Footer>
              </Show>
            </CommandList>
          )}
        </Picker.Query>
      }
    >
      {(group) => (
        <GroupCommands
          group={group()}
          search={groupSearch()}
          value={currentValue()}
          onSelect={props.onSelect}
          onClear={props.onClear}
          onBack={() => setGroup(undefined)}
        />
      )}
    </Show>
  );
}

type Choice = Picker.Choice & { expression: AttrsSchema.FilterExpr };

type Candidate = Picker.Choice & { raw: Filters.PickerValue };

function GroupCommands(props: {
  group: Filters.Group;
  search?: string;
  value?: AttrsSchema.FilterExpr;
  onSelect: (expression: AttrsSchema.FilterExpr) => void;
  onBack: () => void;
  onClear?: () => void;
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
    const queries: QueryEngine.Query<
      Choice | MenuQuery.Action,
      unknown,
      RecordRepo.Service | RecordCache.Service
    >[] = props.group.entries.map((entry, index) => {
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
                <Show when={props.onClear}>
                  <Picker.Clear onSelect={props.onClear} />
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
          onClear={props.onClear}
        />
      )}
    </Show>
  );
}

function entryQuery(
  entry: Filters.Definition,
  index: number,
  expression?: AttrsSchema.FilterExpr,
): QueryEngine.Query<Choice, unknown, RecordRepo.Service | RecordCache.Service> {
  const selection = expression ? entry.selection(expression) : Option.none();

  if (!entry.picker) return namedEntryQuery(entry, index, selection);

  const candidates = pickerCandidates(entry.picker, index, selection);

  return (request) => {
    return candidates(request).pipe(
      Stream.map((matches) => {
        return Array.filterMap(matches, (match) => {
          return Result.fromOption(
            Option.map(entry.select(match.value.raw), (selected) => ({
              ...match,
              value: { ...match.value, expression: selected },
            })),
            () => undefined,
          );
        });
      }),
    );
  };
}

function namedEntryQuery(
  entry: Filters.Definition,
  index: number,
  selection: Option.Option<Filters.PickerValue>,
): QueryEngine.Query<Choice, unknown, RecordCache.Service> {
  const item = Option.flatMap(entry.select(undefined), (expression) => {
    return Option.map(entry.getLabel(expression), (label) => ({ expression, label }));
  });

  if (Option.isNone(item)) return MenuQuery.choices(() => []);
  const { expression: target, label } = item.value;

  const toChoice = (text: string): Choice => ({
    value: String(index),
    label: text,
    expression: target,
    suffix: Option.isSome(selection) ? (
      <SelectedIcon aria-label="Selected" class="size-4" />
    ) : undefined,
  });

  if (!Array.isReadonlyArrayNonEmpty(Filters.labelRecords(label))) {
    return MenuQuery.choices(() => [toChoice(Filters.renderLabel(label))]);
  }

  return (request) => {
    return resolveFilterLabels([label]).pipe(
      Stream.switchMap(([resolved]) => {
        return MenuQuery.choices(() => [toChoice(resolved ?? Filters.renderLabel(label))])(request);
      }),
    );
  };
}

function pickerCandidates(
  picker: NonNullable<Filters.Definition["picker"]>,
  index: number,
  selection: Option.Option<Filters.PickerValue>,
): QueryEngine.Query<Candidate, unknown, RecordRepo.Service> {
  const makeCandidate = (value: Filters.PickerValue, label: string): Candidate => ({
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

  return Match.value(picker).pipe(
    Match.tag("Choices", ({ groups }) => {
      return MenuQuery.choices(() => {
        return groups.flatMap((group) => {
          return group.choices.map((item) => ({
            ...makeCandidate(item.value, item.label),
            icon: choiceIcon(item.icon),
            group: group.label ? `${index}:${group.label}` : "operators",
            groupLabel: group.label ? () => group.label : undefined,
          }));
        });
      });
    }),
    Match.tag("Record", ({ filter }) => {
      const query = filter.length ? RecordQuery.scoped({ filter }) : RecordQuery.query;

      return QueryEngine.map(query, (record) => ({
        ...makeCandidate(record.value, record.label),
        badge: record.badge,
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
            ? [{ score: 1, value: makeCandidate(picker.defaultValue, picker.defaultValue) }]
            : []),
          {
            // Free-text accepts any query, so keep it below concrete matches in combined pickers.
            score: 0.2,
            value: makeCandidate(
              request.text,
              request.text === "" ? 'Use empty text ""' : request.text,
            ),
          },
        ]);
      };
    }),
    Match.tag("Number", () => {
      return (request: QueryEngine.Request) => {
        return Stream.succeed(
          !request.text.trim() && Predicate.isNumber(picker.defaultValue)
            ? [{ score: 1, value: makeCandidate(picker.defaultValue, String(picker.defaultValue)) }]
            : Option.match(PropQuery.parseNumber(request.text), {
                onNone: () => [],
                onSome: ({ val }) => [{ score: 1, value: makeCandidate(val, String(val)) }],
              }),
        );
      };
    }),
    Match.tag("Date", () => {
      return QueryEngine.map(DateSuggestions.query, (date) => makeCandidate(date.id, date.title));
    }),
    Match.exhaustive,
  );
}

function choiceIcon(icon: Filters.ChoiceIcon | undefined): JSX.Element | undefined {
  if (!icon) return undefined;

  return Match.value(icon).pipe(
    Match.when("set", () => <CircleCheck aria-hidden="true" />),
    Match.when("valid", () => <CircleCheck aria-hidden="true" />),
    Match.when("unset", () => <CircleDashed aria-hidden="true" />),
    Match.when("invalid", () => <CircleX aria-hidden="true" />),
    Match.exhaustive,
  );
}
