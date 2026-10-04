import { getRouteApi } from "@tanstack/solid-router";
import type { DropdownMenuTriggerProps } from "@kobalte/core/dropdown-menu";
import { Show, createSignal } from "solid-js";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { PaneSchema } from "../../lib/note/pane.schema";
import { PaneScroll } from "../../lib/note/pane.scroll";
import {
  ArrowsOutIcon,
  ArrowUpRightIcon,
  CalendarCogIcon,
  CalendarIcon,
  EllipsisIcon,
  LinkIcon,
  PlusIcon,
  RebaseIcon,
  XIcon,
} from "../icons";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { callHandler } from "../../lib/call-handler";
import { cx } from "../../lib/cva";
import { DOMScroll } from "../../lib/dom-scroll";
import { DatePicker } from "./date-picker";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import type { NoteSchema } from "../../lib";
import { Focus } from "./focus";

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

// Pane-level controls sit on the right; children (e.g. stream filters) fill the left.
export function PaneHeader(props: ParentProps<{ onCreate?: () => void }>) {
  return (
    <div class="flex items-center gap-3 justify-between p-4 pane:px-0">
      {props.children}
      <PaneActions onCreate={props.onCreate} />
    </div>
  );
}

function PaneActions(props: { onCreate?: () => void }) {
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
      key: [["F"]],
      enabled: canFocus,
      handler: () => {
        focusPane();

        return true;
      },
    },
  ]);

  return (
    <div class="ml-auto flex gap-1">
      <Show when={props.onCreate}>
        {(onCreate) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            rounded="full"
            title="Create note (Ctrl+Enter)"
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

export function NoteActions(props: { note: NoteSchema.Meta }) {
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

  fnode.registerShortcuts([
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

  const [datePickerOpen, setDatePickerOpen] = createSignal(false);
  const [menuTrigger, setMenuTrigger] = createSignal<HTMLButtonElement>();

  // Kobalte refocuses the menu trigger once the menu closes, which would steal
  // focus from whatever the selection opened. Run the selection after that, as
  // if its shortcut were pressed from the note.
  let selected: (() => void) | undefined;

  const select = (action: () => void) => () => {
    selected = action;
  };

  // A corner menu that fades in on hover or focus. Keyboard shortcuts work
  // regardless of visibility.
  return (
    <>
      <DropdownMenu placement="bottom-end">
        <DropdownMenuTrigger
          ref={setMenuTrigger}
          as={(triggerProps: DropdownMenuTriggerProps<HTMLButtonElement>) => (
            <Button
              {...triggerProps}
              variant="plain"
              size="icon-xs"
              rounded="full"
              aria-label="Note actions"
              class="absolute top-0.5 right-0 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-expanded:opacity-100 [&_svg]:text-fg-subtle hover:[&_svg]:text-fg data-expanded:[&_svg]:text-fg"
            >
              <EllipsisIcon />
            </Button>
          )}
        />
        <DropdownMenuPortal>
          <DropdownMenuContent
            class="min-w-52"
            onCloseAutoFocus={() => {
              const action = selected;

              selected = undefined;

              if (action) queueMicrotask(action);
            }}
          >
            <DropdownMenuItem onSelect={select(openOnly)}>
              <ArrowsOutIcon />
              Open only this note
              <DropdownMenuShortcut>O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={select(() => openNext(PaneMake.backlink(props.note.id)))}>
              <LinkIcon />
              Backlinks
              <DropdownMenuShortcut>B I</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={select(() => openNext(PaneMake.outgoing(props.note.id)))}>
              <ArrowUpRightIcon />
              Outgoing links
              <DropdownMenuShortcut>B O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={select(() => openNext(PaneMake.date(props.note.date)))}>
              <CalendarIcon />
              Go to date
              <DropdownMenuShortcut>D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={select(() => setDatePickerOpen(true))}>
              <CalendarCogIcon />
              Change date…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div class="px-2 py-1.5 text-xs text-fg-subtle">
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
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
      <DatePicker
        noteId={props.note.id}
        date={props.note.date}
        open={datePickerOpen()}
        onOpenChange={setDatePickerOpen}
        anchor={menuTrigger()}
      />
    </>
  );
}

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
