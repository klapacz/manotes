import { createFileRoute } from "@tanstack/solid-router";
import { Schema } from "effect";
import { Pane } from "../components/note/pane";
import { PaneCtx } from "../lib/note/pane.ctx";
import { PaneScroll } from "../lib/note/pane.scroll";
import { Focus } from "../components/note/focus";

import { NoteSearch } from "@manotes/shared/note/search";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: NoteSearch.Schema.pipe(Schema.toStandardSchemaV1),
});

function RouteComponent() {
  return <NotesCanvas />;
}

function NotesCanvas() {
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
