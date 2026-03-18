import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Effect, Option, Stream } from "effect";
import { createEffect, For, onCleanup, Show, type JSX } from "solid-js";
import Editor from "../editor";
import * as BacklinkService from "../lib/materializer/backlink/service";
import * as NoteRepo from "../lib/note.repo";
import { ProseKit } from "prosekit/solid";
import { createEditor, union } from "prosekit/core";
import { defineReadonly } from "prosekit/extensions/readonly";
import { defineAppExtension } from "../editor.extension";
import { createRuntimeStreamStore } from "../lib";

export const Route = createFileRoute("/$graph/note/$note")({
  loader: async ({ context, params }) => {
    const note = await context.runtime.runPromise(
      NoteRepo.Service.pipe(
        Effect.flatMap((repo) => repo.findById(params.note)),
      ),
    );

    if (Option.isNone(note)) {
      return { note, backlinks: [] };
    }

    if (note.value.isDaily) {
      throw redirect({
        to: "/$graph",
        params: { graph: params.graph },
        search: { date: params.note },
      });
    }

    const backlinks = await context.runtime.runPromise(
      BacklinkService.Service.pipe(
        Effect.flatMap((service) => service.listIncomingPreviews(params.note)),
      ),
    );

    return { note, backlinks };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const backlinks = createRuntimeStreamStore(() => {
    if (Option.isNone(data().note)) return Stream.succeed([]);

    return BacklinkService.Service.pipe(
      Effect.flatMap((service) =>
        service.reactiveListIncomingPreviews(params().note),
      ),
      Stream.unwrap,
    );
  }, data().backlinks);

  return (
    <Show
      when={Option.getOrNull(data().note)}
      fallback={<div class="p-6 text-fg-subtle">Note not found.</div>}
    >
      {(n) => (
        <div class="p-6 space-y-8">
          <Editor noteId={n().id} isDaily={false} />

          <section class="space-y-3 p-3 bg-bg-subtle rounded-md">
            <h2 class="px-4 text-xs font-medium text-fg-subtle uppercase">
              Backlinks
            </h2>

            <Show
              when={backlinks.length > 0}
              fallback={
                <div class="text-sm text-fg-subtle">No backlinks yet.</div>
              }
            >
              <div class="divide-y rounded-md">
                <For each={backlinks}>
                  {(backlink) => <BacklinkSnippet content={backlink.preview} />}
                </For>
              </div>
            </Show>
          </section>
        </div>
      )}
    </Show>
  );
}

function BacklinkSnippet(props: {
  content: BacklinkService.IncomingBacklinkPreview["preview"];
}): JSX.Element {
  const editor = createEditor({
    extension: union([defineAppExtension({ isDaily: true }), defineReadonly()]),
  });

  createEffect(() => editor.setContent(props.content));
  onCleanup(() => editor.unmount());

  return (
    <ProseKit editor={editor}>
      <div
        ref={editor.mount}
        class="bg-bg-subtle text-fg-subtle px-4 py-3 outline-hidden"
      />
    </ProseKit>
  );
}
