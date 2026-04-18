import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Option } from "effect";
import { createSignal, Show } from "solid-js";
import { WindowVirtualizer } from "virtua/solid";
import Editor, { type BootState } from "../editor";
import * as EditorNoteBootCache from "../lib/editor/note-boot-cache.service";
import * as GraphRuntimeRouter from "../lib/graph-access/graph-runtime/router";
import * as NoteRepo from "../lib/note.repo";
import {
  BacklinkSnippet,
  IncomingBacklinks,
  IncomingBacklinksFetcher,
  IncomingBacklinksHeader,
  IncomingBacklinksList,
} from "../components/incoming-backlinks";

export const Route = createFileRoute("/$graph/note/$note")({
  loader: async ({ params }) => {
    const note = await GraphRuntimeRouter.runPromiseOrRedirect(
      params.graph,
      NoteRepo.Service.use((repo) => repo.findById(params.note)),
    );

    if (Option.isNone(note)) {
      return { note };
    }

    if (note.value.isDaily) {
      throw redirect({
        to: "/$graph",
        params: { graph: params.graph },
        search: { date: params.note },
      });
    }

    await GraphRuntimeRouter.runPromiseOrRedirect(
      params.graph,
      EditorNoteBootCache.Service.use((cache) => cache.preload(params.note)),
    );

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
              <Editor noteId={n().id} isDaily={false} onBootStateChange={handleBootStateChange} />
            </div>

            <IncomingBacklinksFetcher noteId={n().id}>
              {(backlinks) => (
                <Show when={backlinks.length > 0}>
                  <IncomingBacklinks>
                    <IncomingBacklinksHeader />
                    <IncomingBacklinksList>
                      <WindowVirtualizer data={backlinks}>
                        {(backlink) => <BacklinkSnippet backlink={backlink} />}
                      </WindowVirtualizer>
                    </IncomingBacklinksList>
                  </IncomingBacklinks>
                </Show>
              )}
            </IncomingBacklinksFetcher>
          </div>
        );
      }}
    </Show>
  );
}
