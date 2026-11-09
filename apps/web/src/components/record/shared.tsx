import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { PaneNavigate } from "../../lib/record/pane.navigate";
import { Filters } from "@manotes/shared/record/filters";
import type { RecordRepo } from "@manotes/shared/record.repo";
import { getRouteApi } from "@tanstack/solid-router";
import { Data, Exit, type Types } from "effect";
import { useAtom } from "@effect/atom-solid";
import { Atom, AsyncResult } from "effect/reactivity";
import { Show, createMemo, createSignal } from "solid-js";
import { RecordFormat } from "../../lib/record";
import { PaneCursor } from "../../lib/record/pane.cursor";
import { PaneCtx } from "../../lib/record/pane.ctx";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import {
  ArrowsOutIcon,
  ArrowUpRightIcon,
  CalendarCogIcon,
  CalendarIcon,
  EllipsisIcon,
  LinkIcon,
  MicIcon,
  PlusIcon,
  RebaseIcon,
  XIcon,
} from "../icons";
import { Button } from "../ui/button";
import { Picker } from "../ui/picker";
import { callHandler } from "../../lib/call-handler";
import { cx } from "../../lib/cva";
import { DOMScroll } from "../../lib/dom-scroll";
import { RecordDatePicker } from "./date-picker";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { DateSuggestions } from "../../lib/date-suggestions";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import { MatchTag } from "../../lib";
import { Focus } from "./focus";
import { RecordProps } from "./record-props";
import { RecordPropsEntries } from "./record-props.entries";
import { LiveDoc } from "../../lib/live-doc.service";
import { LiveDocAtom } from "../../lib/live-doc.atom";

const route = getRouteApi("/$graph/");

export function PaneShell(props: ComponentProps<"section">) {
  const [local, rest] = splitProps(props, ["children", "onFocusIn"]);

  return (
    <section
      class="h-full w-pane max-w-screen shrink-0 snap-center outline-none"
      {...rest}
      onFocusIn={(event) => {
        callHandler(event, local.onFocusIn);

        // Entering a pane smoothly centers it horizontally. Moves within the pane
        // must not, or they would undo an explicit scroll to another pane.
        const element = event.currentTarget;
        const from = event.relatedTarget;

        if (!(from instanceof Node && element.contains(from))) void DOMScroll.center(element);
      }}
    >
      <div class="flex flex-col h-full min-h-0">{local.children}</div>
    </section>
  );
}

export type RecordControls = {
  onRecord: () => void;
  isDisabled: boolean;
};

type PaneActionsProps = {
  onCreate?: () => void;
  record?: RecordControls;
};

// Pane-level controls sit on the right; children (e.g. stream filters) fill the left.
export function PaneHeader(props: ParentProps<PaneActionsProps & { class?: string }>) {
  return (
    <div class={cx("flex items-center gap-3 justify-between p-4 pane:px-0", props.class)}>
      {props.children}
      <PaneActions onCreate={props.onCreate} record={props.record} />
    </div>
  );
}

function PaneActions(props: PaneActionsProps) {
  const ctx = PaneCtx.use();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();
  const canFocus = () => ctx.index() > 0;
  const focusPane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.focus));
  const closePane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.close));

  fnode.registerShortcuts([
    {
      key: [["X"]],
      handler: () => {
        closePane();

        return true;
      },
    },
    {
      key: [["Shift+F"]],
      enabled: canFocus,
      handler: () => {
        focusPane();

        return true;
      },
    },
  ]);

  return (
    <div class="ml-auto flex gap-1">
      <Show when={props.record}>
        {(record) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            rounded="full"
            title="Record audio memo"
            aria-label="Record audio memo"
            disabled={record().isDisabled}
            onClick={() => record().onRecord()}
          >
            <MicIcon />
          </Button>
        )}
      </Show>
      <Show when={props.onCreate}>
        {(onCreate) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            rounded="full"
            title="Create record (Ctrl+Enter)"
            aria-label="Create record"
            onClick={() => onCreate()()}
          >
            <PlusIcon />
          </Button>
        )}
      </Show>
      <Show when={canFocus()}>
        <Button type="button" variant="ghost" size="icon-xs" rounded="full" onClick={focusPane}>
          <RebaseIcon />
        </Button>
      </Show>
      <Button type="button" variant="ghost" size="icon-xs" rounded="full" onClick={closePane}>
        <XIcon />
      </Button>
    </div>
  );
}

export function RecordActions(props: { record: RecordRepo.Meta }) {
  const state = LiveDocAtom.use({ recordId: () => props.record.id });
  const doc = createMemo(() => LiveDoc.readyDoc(state()));

  const propGroups = createMemo(() => {
    return Atom.toStreamResult(RecordPropsEntries.byRecord()(props.record.id));
  });

  const ctx = PaneCtx.use();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();

  const openNext = PaneNavigate.useOpenNext();

  const openBacklinks = () => {
    return openNext(
      PaneSchema.make.stream({
        filter: [
          AttrsSchema.makeFilterExpr.cmp({
            val: [["link", "->", props.record.id], "exists", true],
          }),
          Filters.aliases.unarchived.make(),
        ],
        sort: "date",
        view: "full",
      }),
    );
  };

  const openOutgoing = () => {
    return openNext(
      PaneSchema.make.stream({
        filter: [
          AttrsSchema.makeFilterExpr.cmp({
            val: [["link", "<-", props.record.id], "exists", true],
          }),
          Filters.aliases.unarchived.make(),
        ],
        sort: "updated",
        view: "full",
      }),
    );
  };

  const openDate = () => {
    return openNext(
      PaneSchema.make.stream({
        filter: [
          AttrsSchema.makeFilterExpr.cmp({ val: ["date", "=", props.record.date] }),
          Filters.aliases.unarchived.make(),
        ],
        sort: "date",
        view: "full",
      }),
    );
  };

  const openOnly = () => {
    const pane = ctx.pane();

    const input = PaneSchema.Pane.guards.record(pane)
      ? pane
      : PaneSchema.make.record({ id: props.record.id });

    return void navigate(PaneCtx.linkOptions(ctx, PaneCursor.replaceAll(input)));
  };

  const [menuOpen, setMenuOpen] = createSignal(false);
  const [page, setPage] = createSignal<MenuPage>(MenuPage.Actions());

  const changeMenuOpen = (open: boolean) => {
    if (open) setPage(MenuPage.Actions());

    setMenuOpen(open);
  };

  fnode.registerShortcuts([
    {
      key: [["M"]],
      handler: () => {
        changeMenuOpen(true);

        return true;
      },
    },
    {
      key: [["B", "I"]],
      handler: () => {
        openBacklinks();

        return true;
      },
    },
    {
      key: [["B", "O"]],
      handler: () => {
        openOutgoing();

        return true;
      },
    },
    {
      key: [["O"]],
      handler: () => {
        openOnly();

        return true;
      },
    },
    {
      key: [["D"]],
      handler: () => {
        openDate();

        return true;
      },
    },
  ]);

  return (
    <>
      <Picker.Root label="Record actions" open={menuOpen()} onOpenChange={changeMenuOpen}>
        <Picker.Trigger
          title="Record actions (M)"
          variant="plain"
          size="icon-xs"
          rounded="full"
          class="absolute top-0.5 right-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-expanded:opacity-100 [&_svg]:text-fg-subtle hover:[&_svg]:text-fg data-expanded:[&_svg]:text-fg"
        >
          <EllipsisIcon />
        </Picker.Trigger>
        <Picker.Content>
          {(close) => {
            const changeDate = RecordDatePicker.useChangeDate({
              get recordId() {
                return props.record.id;
              },
              onChanged: close,
            });

            const [propertyMutation, editProperty] = useAtom(RecordProps.Edit, {
              mode: "promiseExit",
            });

            const setProperty = async (
              action: Types.ExtractTag<RecordProps.Action, "SetProperty">,
            ) => {
              const currentDoc = doc();

              if (!currentDoc) return;

              const exit = await editProperty({
                doc: currentDoc,
                recordId: props.record.id,
                selection: action.selection,
                value: action.propVal,
              });

              if (Exit.isFailure(exit)) return;

              setPage(MenuPage.Property({ selection: action.selection }));
            };

            const dates = QueryEngine.map(DateSuggestions.query, (date): RecordMenuChoice => ({
              ...RecordMenuAction.SetDate({ date: date.id }),
              value: date.id,
              label: date.title,
            }));

            const actions: readonly RecordMenuChoice[] = [
              {
                ...RecordMenuAction.Navigate({ run: openOnly }),
                value: "open",
                label: "Open only this record",
                icon: <ArrowsOutIcon />,
                shortcut: "O",
              },
              {
                ...RecordMenuAction.Navigate({
                  run: () => openBacklinks(),
                }),
                value: "backlinks",
                label: "Link to",
                icon: <LinkIcon />,
                shortcut: "B I",
              },
              {
                ...RecordMenuAction.Navigate({
                  run: () => openOutgoing(),
                }),
                value: "outgoing",
                label: "Outgoing links",
                icon: <ArrowUpRightIcon />,
                shortcut: "B O",
              },
              {
                ...RecordMenuAction.Navigate({
                  run: () => openDate(),
                }),
                value: "date",
                label: "Go to date",
                icon: <CalendarIcon />,
                shortcut: "D",
                group: "date",
              },
              {
                ...RecordMenuAction.OpenDatePicker(),
                value: "change-date",
                keywords: ["calendar"],
                label: "Change date",
                suffix: <Picker.Caret />,
                icon: <CalendarCogIcon />,
                group: "date",
              },
            ];

            const query = createMemo(() => {
              return QueryEngine.combine([
                MenuQuery.choices(() => actions),
                MenuQuery.nested({ label: "Change date", query: dates }),
                RecordProps.query({ groups: propGroups() }),
              ]);
            });

            return (
              <MatchTag
                when={page()}
                cases={{
                  Actions: () => (
                    <>
                      <Picker.Query
                        label="Record actions"
                        query={query()}
                        onSelect={(choice) => {
                          return RecordMenuAction.$match(choice, {
                            Navigate: ({ run }) => close(run),
                            OpenDatePicker: () => setPage(MenuPage.ChangeDate()),
                            SetDate: ({ date }) => void changeDate(date),
                            OpenProperty: ({ selection }) => {
                              if (doc()) setPage(MenuPage.Property({ selection }));
                            },
                            SetProperty: (action) => void setProperty(action),
                          });
                        }}
                      />

                      <Show when={AsyncResult.isFailure(propertyMutation())}>
                        <p role="alert" class="px-3 py-2 text-sm text-error-fg">
                          Unable to update property.
                        </p>
                      </Show>

                      <div class="border-t border-border-subtle px-3 py-2 text-xs text-fg-subtle">
                        <p>
                          Dated{" "}
                          <time dateTime={props.record.date}>
                            {RecordFormat.formatShortDate(props.record.date)}
                          </time>
                        </p>
                        <p>
                          Edited <time>{RecordFormat.formatUpdatedAt(props.record.updatedAt)}</time>
                        </p>
                      </div>
                    </>
                  ),
                  Property: (page) => (
                    <Show when={doc()}>
                      {(doc) => (
                        <RecordProps.Menu
                          recordId={props.record.id}
                          doc={doc()}
                          selection={page().selection}
                          onBack={() => setPage(MenuPage.Actions())}
                          onOpenRecord={(id) => {
                            return close(() => openNext(PaneSchema.make.record({ id: id })));
                          }}
                        />
                      )}
                    </Show>
                  ),
                  ChangeDate: () => (
                    <RecordDatePicker.Menu
                      date={props.record.date}
                      onChange={(date) => void changeDate(date)}
                      onBack={() => setPage(MenuPage.Actions())}
                    />
                  ),
                }}
              />
            );
          }}
        </Picker.Content>
      </Picker.Root>
    </>
  );
}

type MenuPage = Data.TaggedEnum<{
  Actions: {};
  ChangeDate: {};
  Property: { readonly selection: RecordPropsEntries.Selection };
}>;

const MenuPage = Data.taggedEnum<MenuPage>();

type RecordMenuAction =
  | Data.TaggedEnum<{
      Navigate: { run: () => void };
      OpenDatePicker: {};
      SetDate: { date: string };
    }>
  | RecordProps.Action;

const RecordMenuAction = Data.taggedEnum<RecordMenuAction>();

type RecordMenuChoice = Picker.Choice & RecordMenuAction;

// The background marks the active record; the top border marks browse mode.
// Keep this highlight while a local control or portal temporarily takes focus.
export function RecordShell(props: ComponentProps<"article">) {
  const fnode = Focus.useNode();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);

  return (
    <article
      {...rest}
      class={cx("transition-colors relative border-t border-t-border-subtle", local.class)}
      classList={{
        ...local.classList,
        "bg-bg-subtle": fnode.highlightWithin(),
        "border-t-primary-border": fnode.highlighted(),
      }}
    >
      {local.children}
    </article>
  );
}

// Group divider that heads the record below it. It sits in normal flow in the
// gutter above the card (the row wrapper, not the tinted card, is the scroll
// target), so it reads as a separator between records and autoscroll keeps it
// visible. Notes continuing a run render nothing.
export function RecordDivider(props: { date: string }) {
  return (
    <time
      dateTime={props.date}
      class="block font-serif font-medium my-3 text-center text-fg-subtle"
    >
      {RecordFormat.formatGroupLabel(props.date)}
    </time>
  );
}

export function PaneEmptyState(props: ParentProps) {
  return <p class="px-4 py-12 text-sm text-fg-subtle pane:px-0">{props.children}</p>;
}
