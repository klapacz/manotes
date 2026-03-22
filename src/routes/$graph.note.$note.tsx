import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Effect, Option } from "effect";
import { createSignal, Show } from "solid-js";
import Editor, { type BootState } from "../editor";
import * as EditorNoteBootCache from "../lib/editor/note-boot-cache.service";
import * as NoteRepo from "../lib/note.repo";
import {
  IncomingBacklinksFetcher,
  IncomingBacklinksSection,
} from "../components/incoming-backlinks";

export const Route = createFileRoute("/$graph/note/$note")({
  loader: async ({ context, params }) => {
    const note = await context.runtime.runPromise(
      NoteRepo.Service.pipe(
        Effect.flatMap((repo) => repo.findById(params.note)),
      ),
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

    await context.runtime.runPromise(
      EditorNoteBootCache.Service.pipe(
        Effect.flatMap((cache) => cache.preload(params.note)),
      ),
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
      fallback={
        <div class="mx-auto max-w-3xl px-6 py-10 text-fg-subtle">
          Note not found.
        </div>
      }
    >
      {(n) => {
        const [docVisible, setDocVisible] = createSignal(false);
        const handleBootStateChange = (state: BootState) =>
          setDocVisible(state._tag !== "Loading");

        return (
          <div class="mx-auto max-w-3xl px-6 py-10 space-y-12">
            <div
              class="transition-opacity duration-150 ease-out"
              classList={{ "opacity-0": !docVisible() }}
            >
              <Editor
                noteId={n().id}
                isDaily={false}
                onBootStateChange={handleBootStateChange}
              />
            </div>

            <IncomingBacklinksFetcher noteId={n().id}>
              {(backlinks) => (
                <IncomingBacklinksSection backlinks={backlinks} />
              )}
            </IncomingBacklinksFetcher>
          </div>
        );
      }}
    </Show>
  );
}
