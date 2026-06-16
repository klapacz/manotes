import { getRouteApi } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { LinkButton } from "../ui/link-button";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { PaneSchema } from "../../lib/note/pane.schema";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { ArrowsOutIcon, RebaseIcon, XIcon } from "../icons";
import { Button } from "../ui/button";
import { DatePicker } from "./date-picker";
import { splitProps, type ComponentProps, type ParentProps } from "solid-js";
import type { NoteSchema } from "../../lib";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

export function PaneShell(props: ComponentProps<"div">) {
  return (
    <div class="flex flex-col gap-4 h-full min-h-0 px-6 py-4" {...props}>
      {props.children}
    </div>
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
  const openOnly = () =>
    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.replaceAll(openOnlyInput())));
  const openOnlyInput = (): PaneSchema.PaneInput => {
    const pane = ctx.pane();
    if (pane._tag === "note" && pane.id === props.note.id) {
      return { _tag: "note", id: props.note.id, paneId: pane.paneId };
    }

    return PaneMake.note(props.note.id);
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

  return (
    <div class="flex items-center gap-2 text-xs text-fg-subtle">
      <button
        type="button"
        aria-label="Open note only"
        title="Open note only"
        class="rounded px-1 hover:bg-control-hover hover:text-fg"
        onClick={openOnly}
      >
        <ArrowsOutIcon class="size-3.5" />
      </button>
      <LinkButton onClick={() => openNext(PaneMake.backlink(props.note.id))}>Backlinks</LinkButton>
      <Show when={props.note.date !== props.groupKey}>
        <LinkButton onClick={() => openNext(PaneMake.date(props.note.date))}>
          {NoteFormat.formatShortDate(props.note.date)}
        </LinkButton>
      </Show>
      <DatePicker noteId={props.note.id} date={props.note.date} />
      <Show when={props.sort === "date"}>
        <span>{NoteFormat.formatUpdatedAt(props.note.updatedAt)}</span>
      </Show>
      <Show when={props.dirty}>Dirty</Show>
    </div>
  );
}

export function NoteShell(props: ComponentProps<"article"> & { noteId: string }) {
  const fnode = Focus.useNode();
  const [local, rest] = splitProps(props, ["classList", "children", "noteId"]);

  return (
    <article
      {...rest}
      tabIndex={-1}
      onMouseDown={() => fnode.focusSelf()}
      classList={{
        ...local.classList,
        "bg-control-hover": fnode.focused(),
        "bg-control": fnode.focusWithin(),
      }}
    >
      {local.children}
    </article>
  );
}

export function NoteSeparator(props: { dateString?: string }) {
  return (
    <div class="h-[1lh] flex items-center text-xs">
      <div class="pointer-events-none relative flex-1 border-t border-border-subtle">
        <Show when={props.dateString}>
          {(dateString) => (
            <time
              dateTime={dateString()}
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg px-2 font-medium text-fg-subtle"
            >
              {NoteFormat.formatGroupLabel(dateString())}
            </time>
          )}
        </Show>
      </div>
    </div>
  );
}

export function PaneEmptyState(props: ParentProps) {
  return <p class="py-12 text-sm text-fg-subtle">{props.children}</p>;
}
