import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { NestedStreamFilterEditor } from "./nested-stream-filter";
import type { FilterMenu } from "./filter-picker";
import { StreamDisplay } from "./stream-display";
import { StreamSwitcher } from "./stream-switcher";
import { getRouteApi } from "@tanstack/solid-router";
import { Loading, Show, createMemo, createSignal, isPending } from "solid-js";
import { usePresets } from "../../lib/filters";
import { PaneCursor } from "../../lib/record/pane.cursor";
import { PaneCtx } from "../../lib/record/pane.ctx";
import { StreamSwitch } from "../../lib/record/stream-switch";
import { MatchTag } from "../../lib";
import { Button } from "../ui/button";
import { HorizontalScroll } from "../ui/horizontal-scroll";
import { Focus } from "./focus";
import { PaneHeader, type RecordControls } from "./shared";
import { PropScope } from "./prop-scope";
import { RuleTargets } from "./rule-targets";
import { PresetFilter } from "./preset-filter";

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
  const presets = usePresets();

  const focus = Focus.use();
  const fid = Focus.useId();
  const [menu, setMenu] = createSignal<FilterMenu>({ open: false });
  const [switcherOpen, setSwitcherOpen] = createSignal(false);

  const showSwitcher = () => pane().source?._tag !== "prop" && pane().source?._tag !== "rule";
  const matchedStream = createMemo(() => StreamSwitch.matchStream(pane().filter, presets()));

  const changeFilter = (filter: StreamSettings.Filter) => {
    void navigate({
      ...PaneCtx.linkOptions(
        ctx,
        PaneCursor.updateCurrent(() => ({ ...pane(), filter })),
      ),
      replace: false,
    });
  };

  const changeDisplay = (display: StreamSettings.Display) => {
    void navigate({
      ...PaneCtx.linkOptions(
        ctx,
        PaneCursor.updateCurrent(() => ({ ...pane(), ...display })),
      ),
      replace: false,
    });
  };

  const handleSwitchStream = (choice: StreamSwitch.Choice, next: boolean) => {
    void navigate({
      ...PaneCtx.linkOptions(ctx, StreamSwitch.switchStream(pane(), choice, next)),
      replace: false,
    });
  };

  Focus.useNode().registerShortcuts([
    {
      key: [["S"]],
      enabled: showSwitcher,
      handler: () => {
        setSwitcherOpen(true);

        return true;
      },
    },
    {
      key: [["F"]],
      handler: () => {
        setMenu({ open: true });

        return true;
      },
    },
    {
      key: [["/"]],
      handler: () => {
        setMenu({ open: true, body: true });

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
    <NestedStreamFilterEditor
      filter={pane().filter}
      targetOnly={pane().source?._tag === "prop" || pane().source?._tag === "rule"}
      hideFilters={pane().source === undefined && matchedStream() !== undefined}
      onChange={changeFilter}
      menu={menu()}
      onMenuChange={setMenu}
      onClose={() => focus.request(fid.pane())}
      onOpenRecord={(id) => {
        void navigate(
          PaneCtx.linkOptions(ctx, PaneCursor.replaceAll(PaneSchema.make.record({ id }))),
        );
      }}
    >
      {(trigger, filters, hasFilters) => (
        <>
          <PaneHeader
            class={hasFilters() ? "md:pb-2" : undefined}
            onCreate={props.onCreate}
            record={props.record}
          >
            <HorizontalScroll class="-my-2 -ml-4 -mr-3 flex-1" contentClass="gap-2 py-2">
              <Show when={showSwitcher()}>
                <StreamSwitcher
                  open={switcherOpen()}
                  onOpenChange={setSwitcherOpen}
                  onClose={() => focus.request(fid.pane())}
                  presets={presets()}
                  matched={matchedStream()}
                  onSelect={handleSwitchStream}
                />
              </Show>
              {trigger}
              <StreamDisplay.Menu settings={pane()} onChange={changeDisplay} />
              <Loading fallback={null}>
                <Show when={props.dirty}>
                  <Button
                    type="button"
                    variant="outline"
                    size="chip"
                    rounded="full"
                    onClick={props.onRefresh}
                    disabled={isPending(() => props.dirty)}
                    class="border-warning-border bg-warning-control text-warning-fg hover:bg-warning-control-hover focus-visible:border-warning-border focus-visible:ring-warning-border/30"
                    title="Refresh records that moved or no longer match the filters"
                  >
                    Refresh
                  </Button>
                </Show>
              </Loading>
            </HorizontalScroll>
          </PaneHeader>
          {filters}
          <Show when={pane().source}>
            {(source) => (
              <MatchTag
                when={source()}
                cases={{
                  prop: (source) => (
                    <PropScope.Header
                      propId={source().id}
                      filter={pane().filter}
                      onDiscard={changeFilter}
                    />
                  ),
                  rule: (source) => (
                    <RuleTargets.Header
                      ruleId={source().id}
                      filter={pane().filter}
                      onDiscard={changeFilter}
                    />
                  ),
                  preset: (source) => (
                    <PresetFilter.Header
                      presetId={source().id}
                      filter={pane().filter}
                      onDiscard={changeFilter}
                    />
                  ),
                }}
              />
            )}
          </Show>
        </>
      )}
    </NestedStreamFilterEditor>
  );
}
