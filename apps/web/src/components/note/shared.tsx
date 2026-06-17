import { getRouteApi } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { LinkButton } from "../ui/link-button";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { PaneSchema } from "../../lib/note/pane.schema";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { ArrowsOutIcon, LinkIcon, RebaseIcon, XIcon } from "../icons";
import { Button } from "../ui/button";
import { cx } from "../../lib/cva";
import { DatePicker } from "./date-picker";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import type { NoteSchema } from "../../lib";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

export function PaneShell(props: ComponentProps<"section">) {
  return (
    <section class="h-full w-[min(44rem,100vw)] shrink-0 snap-center outline-none" {...props}>
      <div class="flex flex-col gap-4 h-full min-h-0 px-6 py-4">{props.children}</div>
    </section>
  );
}

export function PaneActions() {
  const ctx = PaneCtx.use();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();
  const canFocus = () => ctx.index() > 0;
  const focusPane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.focus));
  const closePane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.close));

  fnode.registerKeybindings((event) => {
    if (event.key === "x") {
      closePane();
      return true;
    }

    if (event.key !== "f" || !canFocus()) return false;
    focusPane();
    return true;
  });

  return (
    <div class="flex gap-1">
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
export function NoteActions(props: {
  note: NoteSchema.Meta;
  groupKey?: string;
  dirty?: boolean;
  sort: PaneSchema.StreamSort;
}) {
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
    const input = pane._tag === "note" ? pane : PaneMake.note(props.note.id);
    return void navigate(PaneCtx.linkOptions(ctx, PaneCursor.replaceAll(input)));
  };

  fnode.registerKeybindings((event) => {
    if (event.key === "o") {
      openOnly();
      return true;
    }

    if (event.key === "b") {
      openNext(PaneMake.backlink(props.note.id));
      return true;
    }

    if (event.key !== "d") return false;
    openNext(PaneMake.date(props.note.date));
    return true;
  });

  // Stays out of the way until the note is hovered or focused, then fades in.
  // Keyboard shortcuts (o/b/d) work regardless of visibility.
  return (
    <div class="flex items-end gap-1 text-xs text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 h-6 px-6 justify-end">
      <div class="flex items-center gap-2">
        <Show when={props.dirty}>
          <span class="text-warning-fg-subtle">Dirty</span>
        </Show>
        <Show when={props.sort === "date"}>
          <time>{NoteFormat.formatUpdatedAt(props.note.updatedAt)}</time>
        </Show>
      </div>
      <NoteActionButton label="Open note only" onClick={openOnly}>
        <ArrowsOutIcon class="size-3.5" />
      </NoteActionButton>
      <NoteActionButton
        label="Backlinks"
        onClick={() => openNext(PaneMake.backlink(props.note.id))}
      >
        <LinkIcon class="size-3.5" />
      </NoteActionButton>
      <DatePicker noteId={props.note.id} date={props.note.date} />
      <Show when={props.note.date !== props.groupKey}>
        <LinkButton onClick={() => openNext(PaneMake.date(props.note.date))}>
          {NoteFormat.formatShortDate(props.note.date)}
        </LinkButton>
      </Show>
    </div>
  );
}

function NoteActionButton(props: ParentProps<{ label: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      class="rounded p-1 hover:bg-control-hover hover:text-fg"
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

// A focusable note row. The left accent bar marks the active note instead of a
// full background fill: subtle while editing (focusWithin), solid once the row
// itself is the focus target (j/k navigation).
export function NoteShell(props: ComponentProps<"article">) {
  const fnode = Focus.useNode();
  const [local, rest] = splitProps(props, ["class", "classList", "children"]);

  return (
    <article
      {...rest}
      class={cx("transition-colors relative border-t border-t-border-subtle", local.class)}
      classList={{
        ...local.classList,
        "bg-bg-subtle": fnode.focusWithin(),
        "border-t-primary-border": fnode.focused(),
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
    <time dateTime={props.date} class="block font-serif font-medium my-3 text-center">
      {NoteFormat.formatGroupLabel(props.date)}
    </time>
  );
}

export function PaneEmptyState(props: ParentProps) {
  return <p class="py-12 text-sm text-fg-subtle">{props.children}</p>;
}
