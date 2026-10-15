import { getRouteApi } from "@tanstack/solid-router";
import { Data, Exit, type Types } from "effect";
import { useAtom } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show, createMemo, createSignal } from "solid-js";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { PaneScroll } from "../../lib/note/pane.scroll";
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
import { NoteDatePicker } from "./date-picker";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { DateSuggestions } from "../../lib/date-suggestions";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import { MatchTag, type NoteSchema } from "../../lib";
import { Focus } from "./focus";
import { NoteProps } from "./note-props";
import type { NotePropsEntries } from "./note-props.entries";
import type * as Y from "yjs";

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
            title="Create note (Ctrl+Enter)"
            aria-label="Create note"
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

export function NoteActions(props: { note: NoteSchema.Meta; doc: Y.Doc | undefined }) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();

  const openNext = (pane: PaneSchema.PaneInput) => {
    const result = scroll.scrollToPane(pane);

    if (result.found) return;

    return void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(pane)));
  };

  const openOnly = () => {
    const pane = ctx.pane();
    const input = PaneSchema.Pane.guards.note(pane) ? pane : PaneMake.note(props.note.id);

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
        openNext(PaneMake.backlink(props.note.id));

        return true;
      },
    },
    {
      key: [["B", "O"]],
      handler: () => {
        openNext(PaneMake.outgoing(props.note.id));

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
        openNext(PaneMake.date(props.note.date));

        return true;
      },
    },
  ]);

  return (
    <>
      <Picker.Root label="Note actions" open={menuOpen()} onOpenChange={changeMenuOpen}>
        <Picker.Trigger
          title="Note actions (M)"
          variant="plain"
          size="icon-xs"
          rounded="full"
          class="absolute top-0.5 right-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-expanded:opacity-100 [&_svg]:text-fg-subtle hover:[&_svg]:text-fg data-expanded:[&_svg]:text-fg"
        >
          <EllipsisIcon />
        </Picker.Trigger>
        <Picker.Content>
          {(close) => {
            const changeDate = NoteDatePicker.useChangeDate({
              get noteId() {
                return props.note.id;
              },
              onChanged: close,
            });

            const [propertyMutation, editProperty] = useAtom(NoteProps.Edit, {
              mode: "promiseExit",
            });

            const setProperty = async (
              action: Types.ExtractTag<NoteProps.Action, "SetProperty">,
            ) => {
              if (!props.doc) return;

              const exit = await editProperty({
                doc: props.doc,
                recordId: props.note.id,
                selection: action.selection,
                value: action.propVal,
              });

              if (Exit.isFailure(exit)) return;

              setPage(MenuPage.Property({ selection: action.selection }));
            };

            const dates = QueryEngine.map(DateSuggestions.query, (date): NoteMenuChoice => ({
              ...NoteMenuAction.SetDate({ date: date.id }),
              value: date.id,
              label: date.title,
            }));

            const actions: readonly NoteMenuChoice[] = [
              {
                ...NoteMenuAction.Navigate({ run: openOnly }),
                value: "open",
                label: "Open only this note",
                icon: <ArrowsOutIcon />,
                shortcut: "O",
              },
              {
                ...NoteMenuAction.Navigate({
                  run: () => openNext(PaneMake.backlink(props.note.id)),
                }),
                value: "backlinks",
                label: "Link to",
                icon: <LinkIcon />,
                shortcut: "B I",
              },
              {
                ...NoteMenuAction.Navigate({
                  run: () => openNext(PaneMake.outgoing(props.note.id)),
                }),
                value: "outgoing",
                label: "Outgoing links",
                icon: <ArrowUpRightIcon />,
                shortcut: "B O",
              },
              {
                ...NoteMenuAction.Navigate({ run: () => openNext(PaneMake.date(props.note.date)) }),
                value: "date",
                label: "Go to date",
                icon: <CalendarIcon />,
                shortcut: "D",
                group: "date",
              },
              {
                ...NoteMenuAction.OpenDatePicker(),
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
                NoteProps.query({ recordId: props.note.id, doc: props.doc }),
              ]);
            });

            return (
              <MatchTag
                when={page()}
                cases={{
                  Actions: () => (
                    <>
                      <Picker.Query
                        label="Note actions"
                        query={query()}
                        onSelect={(choice) => {
                          return NoteMenuAction.$match(choice, {
                            Navigate: ({ run }) => close(run),
                            OpenDatePicker: () => setPage(MenuPage.ChangeDate()),
                            SetDate: ({ date }) => void changeDate(date),
                            OpenProperty: ({ selection }) => {
                              if (props.doc) setPage(MenuPage.Property({ selection }));
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
                          <time dateTime={props.note.date}>
                            {NoteFormat.formatShortDate(props.note.date)}
                          </time>
                        </p>
                        <p>
                          Edited <time>{NoteFormat.formatUpdatedAt(props.note.updatedAt)}</time>
                        </p>
                      </div>
                    </>
                  ),
                  Property: (page) => (
                    <Show when={props.doc}>
                      {(doc) => (
                        <NoteProps.Menu
                          noteId={props.note.id}
                          doc={doc()}
                          selection={page().selection}
                          onBack={() => setPage(MenuPage.Actions())}
                          onOpenNote={(id) => close(() => openNext(PaneMake.note(id)))}
                        />
                      )}
                    </Show>
                  ),
                  ChangeDate: () => (
                    <NoteDatePicker.Menu
                      date={props.note.date}
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
  Property: { readonly selection: NotePropsEntries.Selection };
}>;

const MenuPage = Data.taggedEnum<MenuPage>();

type NoteMenuAction =
  | Data.TaggedEnum<{
      Navigate: { run: () => void };
      OpenDatePicker: {};
      SetDate: { date: string };
    }>
  | NoteProps.Action;

const NoteMenuAction = Data.taggedEnum<NoteMenuAction>();

type NoteMenuChoice = Picker.Choice & NoteMenuAction;

// The background marks the active note; the top border marks browse mode.
// Keep this highlight while a local control or portal temporarily takes focus.
export function NoteShell(props: ComponentProps<"article">) {
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

// Group divider that heads the note below it. It sits in normal flow in the
// gutter above the card (the row wrapper, not the tinted card, is the scroll
// target), so it reads as a separator between notes and autoscroll keeps it
// visible. Notes continuing a run render nothing.
export function NoteDivider(props: { date: string }) {
  return (
    <time
      dateTime={props.date}
      class="block font-serif font-medium my-3 text-center text-fg-subtle"
    >
      {NoteFormat.formatGroupLabel(props.date)}
    </time>
  );
}

export function PaneEmptyState(props: ParentProps) {
  return <p class="px-4 py-12 text-sm text-fg-subtle pane:px-0">{props.children}</p>;
}
