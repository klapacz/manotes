/**
 * Only the public API was checked. The implementation has not been carefully reviewed.
 * AI agents must notify the user of this review gap before working on this file.
 * @module
 */
// Outline presentation adapted from workspace 04's nested-stream-filter.tsx.
// This version edits canonical URL settings through the shared Filters definitions.
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Filters } from "@manotes/shared/record/filters";
import type { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Option, Predicate } from "effect";
import { Index, Show, createSignal, createUniqueId, type JSX } from "solid-js";
import { ChevronDown, ChevronRight, FunnelPlus, ListPlus, Pencil, Plus, X } from "lucide-solid";
import { useFilters } from "../../lib/filters";
import { cx } from "../../lib/cva";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { FilterLabel, FilterPicker, type FilterMenu } from "./filter-picker";

type Filter = AttrsSchema.Filter;

type Expr = AttrsSchema.FilterExpr;

const expr = AttrsSchema.makeFilterExpr;

export function NestedStreamFilterEditor(props: {
  filter: Filter;
  onChange: (filter: Filter) => void;
  onPreset: (settings: StreamSettings.Settings) => void;
  menu: FilterMenu;
  onMenuChange: (menu: FilterMenu) => void;
  onClose: () => void;
  children: (trigger: JSX.Element, filters: JSX.Element, hasFilters: () => boolean) => JSX.Element;
}) {
  const filters = useFilters();
  const [expanded, setExpanded] = createSignal(false);
  const treeId = createUniqueId();
  let filterButton: HTMLButtonElement | undefined;
  let detailsButton: HTMLButtonElement | undefined;

  const rootGroup = () => {
    return props.filter.length === 1 && props.filter[0]?._tag === "or"
      ? props.filter[0]
      : undefined;
  };

  const rootPath = () => (rootGroup() ? [0] : []);
  const focusFilter = () => filterButton?.focus();

  const expand = () => {
    setExpanded(true);
    queueMicrotask(() => detailsButton?.focus());
  };

  const changeGroup = (path: readonly number[], update: (children: Filter) => Filter) => {
    return props.onChange(Filters.updateGroup(props.filter, path, update));
  };

  const trigger = (
    <FilterPicker
      label="Filter stream"
      filters={filters()}
      siblings={rootGroup()?.val ?? props.filter}
      menu={props.menu}
      onMenuChange={props.onMenuChange}
      onSelect={(expression) => {
        if (
          !Predicate.isTagged(expression, "cmp") &&
          Option.isNone(filters().getLabel(expression))
        ) {
          setExpanded(true);
        }

        changeGroup(rootPath(), (siblings) => {
          return filters().setExpression(siblings, expression, rootGroup() ? "or" : "and");
        });
      }}
      onPreset={props.onPreset}
      onClose={props.onClose}
      triggerRef={(button) => (filterButton = button)}
      class="w-7 justify-center px-0"
      title="Add filter (F)"
    >
      <FunnelPlus class="size-3.5" />
    </FilterPicker>
  );

  const content = (
    <Show when={props.filter.length > 0}>
      <section aria-label="Stream filters" class="mx-4 mb-3 min-w-0 pane:mx-0">
        <div id={treeId} class="min-w-0 py-1">
          <GroupRows
            expressions={rootGroup()?.val ?? props.filter}
            operator={rootGroup() ? "or" : "and"}
            path={rootPath()}
            filters={filters()}
            root
            expanded={expanded()}
            onExpand={expand}
            onChange={changeGroup}
            onToggleOperator={() => {
              return props.onChange(rootGroup()?.val ?? [expr.or({ val: props.filter })]);
            }}
            onRemoveExpression={(path) => {
              return props.onChange(Filters.removeExpression(props.filter, path));
            }}
            onRemoveGroup={() => {
              props.onChange([]);
              focusFilter();
            }}
            onFocusFilter={focusFilter}
            heading={
              <Button
                ref={(button) => (detailsButton = button)}
                variant="ghost"
                size={expanded() ? "xs" : "icon-xs"}
                class="min-w-0 justify-start px-0 font-medium"
                aria-label={expanded() ? "Collapse filter details" : "Expand filter details"}
                aria-expanded={expanded()}
                aria-controls={treeId}
                onClick={() => setExpanded((value) => !value)}
              >
                <Show when={expanded()} fallback={<ChevronRight />}>
                  <ChevronDown />
                </Show>
                <Show when={expanded()}>Filters</Show>
              </Button>
            }
          />
        </div>
      </section>
    </Show>
  );

  return props.children(trigger, content, () => props.filter.length > 0);
}

type GroupRowsProps = {
  expressions: Filter;
  operator: "and" | "or";
  path: readonly number[];
  filters: Filters.Registry;
  root?: boolean;
  label?: Filters.Label;
  heading?: JSX.Element;
  expanded: boolean;
  onExpand: () => void;
  onToggleOperator: () => void;
  onChange: (path: readonly number[], update: (children: Filter) => Filter) => void;
  onEdit?: (expression: Expr) => void;
  onRemoveExpression: (path: readonly number[]) => void;
  onRemoveGroup: () => void;
  onFocusFilter?: () => void;
};

function GroupRows(props: GroupRowsProps) {
  let addButton: HTMLButtonElement | undefined;
  const detailed = () => !props.root || props.expanded;

  return (
    <div class={detailed() ? "flex min-w-0 flex-col" : "flex min-w-0 items-start gap-2"}>
      <Show when={!detailed()}>{props.heading}</Show>
      <Show when={detailed()}>
        <div class="flex min-w-0 flex-wrap items-center gap-1">
          <Show when={!props.root} fallback={props.heading}>
            <span class="flex h-7 min-w-0 items-center text-sm font-medium">
              <Show when={props.label} fallback="Group">
                {(label) => <FilterLabel label={label()} />}
              </Show>
            </span>
          </Show>
          <Show when={!props.root && props.label && props.onEdit}>
            <FilterPicker
              label="Edit named filter"
              filters={props.filters}
              value={expr[props.operator]({ val: props.expressions })}
              onSelect={(next) => props.onEdit?.(next)}
              variant="ghost"
              class="w-7 justify-center px-0"
            >
              <Pencil class="size-3.5" />
            </FilterPicker>
          </Show>
          <Button
            variant="ghost"
            size="icon-xs"
            class="shrink-0 text-fg-subtle"
            aria-label={props.root ? "Remove all filters" : "Remove filter group"}
            onClick={props.onRemoveGroup}
          >
            <X />
          </Button>
        </div>
      </Show>
      <div
        class={cx(
          "min-w-0",
          detailed() && "ml-2 border-l border-border-subtle py-1 pl-1",
          !detailed() && "flex-1",
          props.root && detailed() && "max-h-[45dvh] overflow-auto",
        )}
      >
        <div
          class={
            props.expanded
              ? "flex min-w-0 flex-col items-stretch gap-2"
              : "flex min-w-0 flex-wrap items-center gap-2"
          }
        >
          <Index each={props.expressions}>
            {(expression, index) => (
              <ExpressionRow
                expression={expression()}
                path={[...props.path, index]}
                filters={props.filters}
                join={
                  index > 0 && (!props.root || props.expanded || props.operator === "or")
                    ? props.operator
                    : undefined
                }
                rootJoin={props.root}
                expanded={props.expanded}
                onExpand={props.onExpand}
                onToggleJoin={props.onToggleOperator}
                onReplace={(next) => {
                  return props.onChange(props.path, (siblings) => {
                    return siblings.map((child, i) => (i === index ? next : child));
                  });
                }}
                onRemove={() => {
                  props.onRemoveExpression([...props.path, index]);

                  if (addButton?.isConnected) addButton.focus();
                  else props.onFocusFilter?.();
                }}
                onChange={props.onChange}
                onRemoveExpression={props.onRemoveExpression}
                onFocusFilter={props.onFocusFilter}
              />
            )}
          </Index>
        </div>
        <Show when={detailed()}>
          <div
            class={cx(
              "mt-2 grid items-start gap-x-1 gap-y-2",
              props.expressions.length > 0 && "grid-cols-[1.75rem_minmax(0,1fr)]",
            )}
          >
            <Show when={props.expressions.length > 0}>
              <OperatorToggle
                operator={props.operator}
                onToggle={props.onToggleOperator}
                root={props.root}
              />
            </Show>
            <FilterPicker
              label="Add filter"
              filters={props.filters}
              siblings={props.expressions}
              onSelect={(next) => {
                return props.onChange(props.path, (siblings) => {
                  return props.filters.setExpression(siblings, next, props.operator);
                });
              }}
              variant="ghost"
              class="w-fit rounded-md border border-dashed border-border-subtle text-sm font-normal text-fg-subtle hover:text-fg"
              initiallyOpen={props.expressions.length === 0}
              triggerRef={(button) => (addButton = button)}
            >
              Filter <Plus class="size-3.5" />
            </FilterPicker>
          </div>
        </Show>
      </div>
    </div>
  );
}

function ExpressionRow(props: {
  expression: Expr;
  path: readonly number[];
  filters: Filters.Registry;
  join?: "and" | "or";
  rootJoin?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onToggleJoin: () => void;
  onReplace: (expression: Expr) => void;
  onRemove: () => void;
  onChange: GroupRowsProps["onChange"];
  onRemoveExpression: GroupRowsProps["onRemoveExpression"];
  onFocusFilter?: () => void;
}) {
  const label = () => Option.getOrUndefined(props.filters.getLabel(props.expression));
  const isGroup = () => !Predicate.isTagged(props.expression, "cmp");
  const children = () => (Predicate.isTagged(props.expression, "cmp") ? [] : props.expression.val);
  const operator = () => (Predicate.isTagged(props.expression, "or") ? "or" : "and");

  const title = () => {
    return (
      label() ??
      (isGroup()
        ? Filters.Label.Literal({ val: `${operator().toUpperCase()} group · ${children().length}` })
        : Filters.Label.Literal({ val: "Unavailable" }))
    );
  };

  const editable = () => Option.isSome(props.filters.findGroup(props.expression));

  return (
    <div
      class={
        props.expanded
          ? "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-1 gap-y-2"
          : "flex max-w-full min-w-0 items-center gap-2"
      }
    >
      <Show
        when={props.join}
        fallback={
          <Show when={props.expanded}>
            <span
              aria-hidden="true"
              class="relative h-7 before:absolute before:top-1/2 before:-right-1 before:-left-[5px] before:border-t before:border-border-subtle"
            />
          </Show>
        }
      >
        {(join) => (
          <OperatorToggle operator={join()} onToggle={props.onToggleJoin} root={props.rootJoin} />
        )}
      </Show>
      <Show
        when={isGroup() && props.expanded}
        fallback={
          <ButtonGroup.Root class="inline-flex h-7 max-w-full min-w-0 items-center divide-x divide-border-subtle rounded-md border border-border-subtle bg-bg text-sm shadow-xs">
            <Show
              when={editable()}
              fallback={
                <Show when={isGroup()} fallback={<span class="px-2">Unavailable</span>}>
                  <Button
                    variant="ghost"
                    size="xs"
                    class="h-full min-w-0 font-normal"
                    aria-label="Inspect group filters"
                    onClick={props.onExpand}
                  >
                    <FilterLabel label={title()} />
                  </Button>
                </Show>
              }
            >
              <FilterPicker
                label={isGroup() ? "Edit named filter" : "Edit filter"}
                filters={props.filters}
                value={props.expression}
                onSelect={props.onReplace}
                class="h-full min-w-0 shrink rounded-none border-0 bg-transparent px-2 shadow-none"
              >
                <FilterLabel label={title()} />
              </FilterPicker>
            </Show>
            <Show when={props.expanded && !isGroup()}>
              <FilterPicker
                label="Group with another condition"
                filters={props.filters}
                onSelect={(next) => {
                  const children = props.filters.setExpression([props.expression], next, "and");
                  props.onReplace(
                    children.length === 1 ? children[0]! : expr.and({ val: children }),
                  );
                  props.onExpand();
                }}
                class="h-full w-7 shrink-0 justify-center rounded-none border-0 bg-transparent px-0 shadow-none"
              >
                <ListPlus class="size-3.5" />
              </FilterPicker>
            </Show>
            <Button
              variant="ghost"
              size="icon-xs"
              rounded="none"
              class="h-full shrink-0 text-fg-subtle"
              aria-label="Remove filter"
              title={`Remove ${Filters.renderLabel(title())}`}
              onClick={props.onRemove}
            >
              <X />
            </Button>
          </ButtonGroup.Root>
        }
      >
        <section aria-label="Filter group" class="w-full min-w-0 flex-1">
          <GroupRows
            label={label()}
            expressions={children()}
            operator={operator()}
            path={props.path}
            filters={props.filters}
            onChange={props.onChange}
            onRemoveExpression={props.onRemoveExpression}
            onEdit={props.onReplace}
            onRemoveGroup={props.onRemove}
            onFocusFilter={props.onFocusFilter}
            expanded={props.expanded}
            onExpand={props.onExpand}
            onToggleOperator={() => {
              return props.onReplace(
                expr[operator() === "and" ? "or" : "and"]({ val: children() }),
              );
            }}
          />
        </section>
      </Show>
    </div>
  );
}

function OperatorToggle(props: { operator: "and" | "or"; onToggle: () => void; root?: boolean }) {
  const label = () => {
    return `Change operator ${props.root ? "between root filters" : "inside this group"} from ${props.operator.toUpperCase()} to ${props.operator === "and" ? "OR" : "AND"}`;
  };

  return (
    <Button
      variant="ghost"
      size="xs"
      class="w-7 self-start shrink-0 px-0.5 text-sm font-normal text-fg-subtle"
      aria-label={label()}
      title={label()}
      onClick={props.onToggle}
    >
      {props.operator}
    </Button>
  );
}
