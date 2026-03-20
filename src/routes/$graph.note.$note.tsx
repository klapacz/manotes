import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Effect, Option } from "effect";
import { Show } from "solid-js";
import Editor from "../editor";
import * as NoteRepo from "../lib/note.repo";

export const Route = createFileRoute("/$graph/note/$note")({
  loader: async ({ context, params }) => {
    const note = await context.runtime.runPromise(
      NoteRepo.Service.pipe(
        Effect.flatMap((repo) => repo.findById(params.note)),
      ),
    );

    if (Option.isNone(note)) {
      return note;
    }

    if (note.value.isDaily) {
      throw redirect({
        to: "/$graph",
        params: { graph: params.graph },
        search: { date: params.note },
      });
    }

    return note;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <Show
      when={Option.getOrNull(data())}
      fallback={<div class="p-6 text-fg-subtle">Note not found.</div>}
    >
      {(n) => (
        <div class="p-6">
          <Editor noteId={n().id} isDaily={false} />
        </div>
      )}
    </Show>
  );
}
