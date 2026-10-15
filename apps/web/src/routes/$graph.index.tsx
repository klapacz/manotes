import { createFileRoute } from "@tanstack/solid-router";
import { Schema } from "effect";
import { Pane } from "../components/record/pane";
import { PaneCtx } from "../lib/record/pane.ctx";
import { PaneScroll } from "../lib/record/pane.scroll";
import { Focus } from "../components/record/focus";

import { RecordSearch } from "@manotes/shared/record/search";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: RecordSearch.Schema.pipe(Schema.toStandardSchemaV1),
});

function RouteComponent() {
  return <RecordsCanvas />;
}

function RecordsCanvas() {
  const panes = Route.useSearch({ select: (search) => search.panes });

  return (
    <Focus.Provider>
      <PaneScroll.Root panes={panes}>
        {(pane, index, ref) => (
          <PaneCtx.Provider pane={pane} index={index} stack={panes}>
            <Pane ref={ref} />
          </PaneCtx.Provider>
        )}
      </PaneScroll.Root>
    </Focus.Provider>
  );
}
