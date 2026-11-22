import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Option, Schema } from "effect";
import { Show } from "solid-js";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSearch } from "@manotes/shared/record/search";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Pane } from "../components/record/pane";
import { Focus } from "../components/record/focus";
import { GraphRuntime } from "../lib/graph-access/graph-runtime";
import { GraphAccessRuntime } from "../lib/graph-access/runtime";
import { PaneCtx } from "../lib/record/pane.ctx";
import { PaneScroll } from "../lib/record/pane.scroll";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: RecordSearch.Schema.pipe(Schema.toStandardSchemaV1),
  beforeLoad: async ({ params, search }) => {
    if (search.panes !== undefined) return;

    const state = await GraphAccessRuntime.rt.runPromise(
      GraphRuntime.Manager.Service.use((manager) => manager.find(params.graph)),
    );

    if (!GraphRuntime.Manager.State.$is("Ready")(state)) return;

    const presets = await state.runtime.runPromise(
      PresetRecordRepo.Service.use((repo) => repo.listDefs()),
    );

    const filter = PresetRecordRepo.findDefault(presets).pipe(
      Option.map((preset) => preset.preset_filter),
      Option.getOrElse((): AttrsSchema.Filter => StreamSettings.defaultFilter),
    );

    throw redirect({
      to: "/$graph",
      params,
      search: {
        panes: [PaneSchema.make.stream({ ...StreamSettings.defaultDisplay, filter })],
      },
      replace: true,
    });
  },
});

function RouteComponent() {
  return <RecordsCanvas />;
}

function RecordsCanvas() {
  const panes = Route.useSearch({ select: (search) => search.panes });

  return (
    <Show when={panes()}>
      {(stack) => (
        <Focus.Provider>
          <PaneScroll.Root panes={stack}>
            {(pane, index, ref) => (
              <PaneCtx.Provider pane={pane} index={index} stack={stack}>
                <Pane ref={ref} />
              </PaneCtx.Provider>
            )}
          </PaneScroll.Root>
        </Focus.Provider>
      )}
    </Show>
  );
}
