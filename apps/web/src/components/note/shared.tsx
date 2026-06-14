import { getRouteApi } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { LinkButton } from "../ui/link-button";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { PaneSchema } from "../../lib/note/pane.schema";
import { RebaseIcon, XIcon } from "../icons";
import { Button } from "../ui/button";
import { DatePicker } from "./date-picker";
import type { ParentProps } from "solid-js";
import type { NoteSchema } from "../../lib";

const route = getRouteApi("/$graph/");

export function PaneShell(props: ParentProps) {
  return <div class="flex flex-col gap-4 h-full min-h-0 px-6 py-4">{props.children}</div>;
}

export function PaneActions() {
  const ctx = PaneCtx.use();
  const navigate = route.useNavigate();
  const canFocus = () => ctx.index() > 0;
  const focusPane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.focus));
  const closePane = () => void navigate(PaneCtx.linkOptions(ctx, PaneCursor.close));

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
  const navigate = route.useNavigate();
  const openNext = (pane: PaneSchema.Pane) =>
    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(pane)));

  return (
    <div class="flex gap-2 text-xs text-fg-subtle">
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
