import { Field, StreamFilterEditor, type StreamFilterMenu } from "./stream-filter";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { StreamDisplay } from "./stream-display";
import { getRouteApi } from "@tanstack/solid-router";
import { Show, createSignal } from "solid-js";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import type { PaneSchema } from "@manotes/shared/note/pane.schema";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { Button } from "../ui/button";
import { HorizontalScroll } from "../ui/horizontal-scroll";
import { Focus } from "./focus";
import { PaneHeader, type RecordControls } from "./shared";
import { PropScope } from "./prop-scope";

const route = getRouteApi("/$graph/");

export function PaneStreamFilter(props: {
  dirty: boolean;
  onRefresh: () => void;
  onCreate?: () => void;
  record?: RecordControls;
}) {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.useStream();
  const navigate = route.useNavigate();
  const fnode = Focus.useNode();
  const focus = Focus.use();
  const fid = Focus.useId();

  const [filterMenu, setFilterMenu] = createSignal<StreamFilterMenu>({
    open: false,
    field: undefined,
  });

  const updatePane = (opts: {
    next: PaneSchema.PaneStream;
    closeRest: boolean;
    replace: boolean;
  }) => {
    void navigate({
      ...PaneCtx.linkOptions(
        ctx,
        opts.closeRest
          ? PaneCursor.replaceCurrentAndCloseRest(opts.next)
          : PaneCursor.updateCurrent(() => opts.next),
      ),
      replace: opts.replace,
    });
  };

  const changeFilter = (filter: StreamSettings.Filter, replace?: boolean) => {
    const { settings, typeChanged } = StreamSettings.changeFilter(pane(), filter);
    updatePane({
      next: { ...pane(), ...settings },
      closeRest: typeChanged,
      replace: replace === true,
    });
  };

  const changeDisplay = (display: StreamSettings.Display) => {
    updatePane({ next: { ...pane(), ...display }, closeRest: false, replace: false });
  };

  const refocusNotes = () => focus.request(fid.pane());

  fnode.registerShortcuts([
    {
      key: [["F"]],
      handler: () => {
        setFilterMenu({ open: true, field: undefined });

        return true;
      },
    },
    {
      key: [["/"]],
      handler: () => {
        setFilterMenu({ open: true, field: Field.search() });

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
    <StreamFilterEditor
      menu={filterMenu()}
      onMenuChange={setFilterMenu}
      filter={pane().filter}
      onChange={changeFilter}
      onClose={refocusNotes}
      onOpenNote={(id) => {
        void navigate(PaneCtx.linkOptions(ctx, PaneCursor.replaceAll(PaneMake.note(id))));
      }}
    >
      {(trigger, filters, hasFilters) => (
        <>
          <PaneHeader
            onCreate={props.onCreate}
            record={props.record}
            class={hasFilters() ? "md:pb-2" : undefined}
          >
            <HorizontalScroll class="-my-2 -ml-4 -mr-3 flex-1" contentClass="gap-2 py-2">
              {trigger}
              <StreamDisplay.Menu settings={pane()} onChange={changeDisplay} />
              <Show when={props.dirty}>
                <Button
                  type="button"
                  variant="outline"
                  size="chip"
                  rounded="full"
                  onClick={props.onRefresh}
                  class="border-warning-border bg-warning-control text-warning-fg hover:bg-warning-control-hover focus-visible:border-warning-border focus-visible:ring-warning-border/30"
                  title="Refresh notes that moved or no longer match the filters"
                >
                  Refresh
                </Button>
              </Show>
            </HorizontalScroll>
          </PaneHeader>
          <Show when={hasFilters()}>
            <div class="hidden px-4 pb-3 md:block pane:px-0" aria-label="Current filters">
              <HorizontalScroll class="-mx-4" contentClass="gap-2">
                {filters}
              </HorizontalScroll>
            </div>
          </Show>
          <Show when={pane().scope}>
            {(scope) => (
              <PropScope.Header
                propId={scope().propId}
                filter={pane().filter}
                onDiscard={changeFilter}
              />
            )}
          </Show>
        </>
      )}
    </StreamFilterEditor>
  );
}
