import { createFileRoute } from "@tanstack/solid-router";
import { Effect, Schema } from "effect";
import { For } from "solid-js";
import { Pane, PaneGrid } from "../components/note/pane";
import { PaneCtx } from "../lib/note/pane.ctx";
import { PaneMake } from "../lib/note/pane.make";
import { PaneSchema } from "../lib/note/pane.schema";

export const Search = Schema.Struct({
  panes: Schema.NonEmptyArray(PaneSchema.Pane).pipe(
    Schema.withDecodingDefault(Effect.sync(() => [PaneMake.notes()])),
  ),
});

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: Search.pipe(Schema.toStandardSchemaV1),
});

function RouteComponent() {
  return <NotesCanvas />;
}

function NotesCanvas() {
  const panes = Route.useSearch({ select: (search) => search.panes });

  return (
    <PaneGrid>
      <For each={panes()}>
        {(_, index) => (
          <PaneCtx.Provider index={index} stack={panes}>
            <Pane />
          </PaneCtx.Provider>
        )}
      </For>
    </PaneGrid>
  );
}
