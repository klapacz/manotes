import { getRouteApi } from "@tanstack/solid-router";
import { Option, Stream } from "effect";
import { Show, createMemo, type JSX } from "solid-js";
import { NoteRepo, bindRt, createAtomStore, createSyncedAtom } from "../../lib";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "../../lib/note/pane.schema";
import type * as NoteSchema from "../../lib/note.schema";
import { Button } from "../ui/button";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

type NotePreview = typeof NoteSchema.Preview.Type;

export function PaneStreamFilter(props: { dirty: boolean; onRefresh: () => void }) {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.useStream();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();
  const updatePane = (next: PaneSchema.PaneStream) =>
    void navigate(
      PaneCtx.linkOptions(
        ctx,
        PaneCursor.updateCurrent(() => next),
      ),
    );
  // Panes to the right were opened from this pane's content, so a type switch
  // invalidates them.
  const updatePaneAndCloseRest = (next: PaneSchema.PaneStream) =>
    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.replaceCurrentAndCloseRest(next)));

  // Type and sort travel together: notes read like a journal (logical date),
  // pages like documents (last updated).
  const cycleType = () => {
    const nextType = pane().filter.type === "notes" ? "pages" : "notes";
    updatePaneAndCloseRest({
      ...pane(),
      filter: { ...pane().filter, type: nextType },
      sort: nextType === "notes" ? "date" : "updated",
    });
  };
  const cycleSort = () =>
    updatePane({ ...pane(), sort: pane().sort === "date" ? "updated" : "date" });

  fnode.registerShortcuts([
    {
      key: "T",
      handler: () => {
        cycleType();
        return true;
      },
    },
    {
      key: "S",
      handler: () => {
        cycleSort();
        return true;
      },
    },
    {
      key: "R",
      enabled: () => props.dirty,
      handler: () => {
        props.onRefresh();
        return true;
      },
    },
  ]);

  return (
    <div class="space-x-2">
      <FilterChipButton label="Type" title="Cycle between notes and pages" onClick={cycleType}>
        {pane().filter.type}
      </FilterChipButton>
      <Show when={pane().filter.backlinksTo}>
        {(targetId) => (
          <FilterChipButton label="Backlinks to">
            <BacklinksFilterTarget targetId={targetId()} />
          </FilterChipButton>
        )}
      </Show>
      <Show when={pane().filter.date}>
        {(date) => <FilterChipButton label="Date">{date()}</FilterChipButton>}
      </Show>
      <FilterChipButton label="Sort" title="Cycle sort order" onClick={cycleSort}>
        {pane().sort}
      </FilterChipButton>
      <Show when={props.dirty}>
        <Button
          type="button"
          variant="outline"
          size="chip"
          rounded="full"
          onClick={props.onRefresh}
          title="Refresh notes that moved or no longer match the filters"
        >
          Refresh
        </Button>
      </Show>
    </div>
  );
}

function FilterChipButton(props: {
  label: string;
  title?: string;
  onClick?: () => void;
  children: JSX.Element;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="chip"
      rounded="full"
      title={props.title}
      onClick={props.onClick}
    >
      <span class="text-fg-subtle">{props.label}</span>
      {props.children}
    </Button>
  );
}

function BacklinksFilterTarget(props: { targetId: string }) {
  const targetIdAtom = createSyncedAtom(() => props.targetId);
  const target = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) =>
        NoteRepo.Service.use((repo) => repo.reactiveFindPreviewById(get(targetIdAtom))).pipe(
          Stream.unwrap,
          Stream.map((note) => ({ note: Option.getOrNull(note) })),
        ),
      ),
    ),
    { note: null as NotePreview | null },
  );
  const label = createMemo(() =>
    target.value.note === null ? "Unknown" : NoteFormat.label(target.value.note),
  );

  return (
    <span class="max-w-[11rem] truncate text-fg" title={label()}>
      {label()}
    </span>
  );
}
