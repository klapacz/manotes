import { createFileRoute } from "@tanstack/solid-router";
import { Option } from "effect";
import { createSignal, Show } from "solid-js";
import Editor, { type BootState } from "../editor";
import * as GraphRuntimeRouter from "../lib/graph-access/graph-runtime/router";
import * as NoteRepo from "../lib/note.repo";

export const Route = createFileRoute("/$graph/note/$note")({
  loader: async ({ params }) => {
    const note = await GraphRuntimeRouter.runPromiseOrRedirect(
      params.graph,
      NoteRepo.Service.use((repo) => repo.findById(params.note)),
    );

    if (Option.isNone(note)) {
      return { note };
    }

    return { note };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <Show
      when={Option.getOrNull(data().note)}
      fallback={<div class="mx-auto max-w-4xl px-6 py-10 text-fg-subtle">Note not found.</div>}
    >
      {(n) => {
        const [docVisible, setDocVisible] = createSignal(false);
        const handleBootStateChange = (state: BootState) => setDocVisible(state._tag !== "Loading");

        return (
          <div class="mx-auto max-w-4xl px-6 py-10 space-y-12">
            <div
              class="transition-opacity duration-150 ease-out"
              classList={{ "opacity-0": !docVisible() }}
            >
              <Editor noteId={n().id} onBootStateChange={handleBootStateChange} />
            </div>
          </div>
        );
      }}
    </Show>
  );
}
