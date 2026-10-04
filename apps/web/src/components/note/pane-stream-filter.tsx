import { ToggleGroup } from "@kobalte/core/toggle-group";
import { getRouteApi } from "@tanstack/solid-router";
import { Option, Stream } from "effect";
import { Show, createMemo, type JSX } from "solid-js";
import { NoteRepo, bindRt, createAtomStore, createSyncedAtom } from "../../lib";
import { NoteFormat } from "../../lib/note";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneSchema } from "../../lib/note/pane.schema";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { HorizontalScroll } from "../ui/horizontal-scroll";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

export function PaneStreamFilter(props: { dirty: boolean; onRefresh: () => void }) {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.useStream();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();
  const focus = Focus.use();
  const fid = Focus.useId();
  let searchInput: HTMLInputElement | undefined;

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
  const setType = (nextType: "notes" | "pages") => {
    if (nextType === pane().filter.type) return;

    updatePaneAndCloseRest({
      ...pane(),
      filter: { ...pane().filter, type: nextType },
      sort: nextType === "notes" ? "date" : "updated",
    });
  };

  const cycleSort = () =>
    updatePane({ ...pane(), sort: pane().sort === "date" ? "updated" : "date" });

  const toggleView = () =>
    updatePane({ ...pane(), view: pane().view === "full" ? "snippets" : "full" });

  const setSearch = (search: string) =>
    void navigate({
      ...PaneCtx.linkOptions(
        ctx,
        PaneCursor.updateCurrent(() => ({
          ...pane(),
          filter: { ...pane().filter, search: search || undefined },
        })),
      ),
      replace: true,
    });

  fnode.registerShortcuts([
    {
      key: [["/"]],
      handler: () => {
        searchInput?.focus();
        searchInput?.select();

        return true;
      },
    },
    {
      key: [["T"]],
      handler: () => {
        setType(pane().filter.type === "notes" ? "pages" : "notes");

        return true;
      },
    },
    {
      key: [["S"]],
      handler: () => {
        cycleSort();

        return true;
      },
    },
    {
      key: [["V"]],
      handler: () => {
        toggleView();

        return true;
      },
    },
    {
      key: [["R"]],
      enabled: () => props.dirty,
      handler: () => {
        props.onRefresh();

        return true;
      },
    },
  ]);

  return (
    <HorizontalScroll class="-my-2 -ml-4 -mr-3 flex-1" contentClass="gap-2 py-2">
      <Input
        ref={(element) => (searchInput = element)}
        type="search"
        aria-label="Search this stream"
        aria-keyshortcuts="/"
        title="Search this stream (/)"
        placeholder="Search…"
        class="h-7 w-30 shadow-none"
        value={pane().filter.search ?? ""}
        onInput={(event) => setSearch(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.key !== "Enter" ||
            event.isComposing ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            event.shiftKey
          ) {
            return;
          }

          event.preventDefault();
          focus.request(fid.pane());
        }}
      />
      <ToggleGroup
        aria-label="Content type"
        class="inline-flex rounded-full bg-control p-0.5 align-middle"
        value={pane().filter.type}
        onChange={(value) => {
          if (value === "notes" || value === "pages") setType(value);
        }}
      >
        <ToggleGroup.Item
          value="notes"
          class={typeToggleItemClass}
          title="Show notes, sorted by date"
        >
          Notes
        </ToggleGroup.Item>
        <ToggleGroup.Item
          value="pages"
          class={typeToggleItemClass}
          title="Show pages, sorted by last updated"
        >
          Pages
        </ToggleGroup.Item>
      </ToggleGroup>
      <Show when={pane().filter.backlinksTo}>
        {(targetId) => (
          <FilterChipButton label="Backlinks to">
            <NotePreviewTarget noteId={targetId()} />
          </FilterChipButton>
        )}
      </Show>
      <Show when={pane().filter.linksFrom}>
        {(sourceId) => (
          <FilterChipButton label="Links from">
            <NotePreviewTarget noteId={sourceId()} />
          </FilterChipButton>
        )}
      </Show>
      <Show when={pane().filter.date}>
        {(date) => <FilterChipButton label="Date">{date()}</FilterChipButton>}
      </Show>
      <FilterChipButton label="Sort" title="Cycle sort order" onClick={cycleSort}>
        {pane().sort}
      </FilterChipButton>
      <FilterChipButton label="View" title="Toggle note snippets (V)" onClick={toggleView}>
        {pane().view}
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
    </HorizontalScroll>
  );
}

const typeToggleItemClass = buttonVariants({
  variant: "plain",
  size: "chip",
  rounded: "full",
  class:
    "h-6 text-fg-subtle hover:text-fg data-[pressed]:bg-bg data-[pressed]:text-fg data-[pressed]:shadow-xs focus-visible:z-10",
});

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

function NotePreviewTarget(props: { noteId: string }) {
  const targetIdAtom = createSyncedAtom(() => props.noteId);

  const target = createAtomStore(
    bindRt((rt) =>
      rt.atom((get) =>
        NoteRepo.Service.use((repo) => repo.reactiveFindPreviewById(get(targetIdAtom))).pipe(
          Stream.unwrap,
          Stream.map((note) => ({ note: Option.getOrNull(note) })),
        ),
      ),
    ),
    { note: null },
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
