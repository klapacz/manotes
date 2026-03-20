import { createFileRoute } from "@tanstack/solid-router";
import Editor from "../editor";
import { Effect, Option, Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import * as TemporalSchema from "../lib/temporal.schema";
import * as NoteRepo from "../lib/note.repo";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  loaderDeps: ({ search }) => ({ date: search.date }),
  loader: async ({ context, deps }) => {
    const note = await context.runtime.runPromise(
      NoteRepo.Service.pipe(Effect.flatMap((repo) => repo.findById(deps.date))),
    );

    if (Option.isNone(note)) return { initial: Option.none() };

    return {
      initial: Option.some({
        materializedYUpdate: note.value.materializedYUpdate,
        lastEventLocalSeq: note.value.lastEventLocalSeq,
      }),
    };
  },
  validateSearch: Schema.Struct({
    allowCreate: Schema.optional(Schema.Boolean),
    date: Schema.optional(TemporalSchema.PlainDateString).pipe(
      Schema.withDefaults({
        decoding: () => Temporal.Now.plainDateISO().toString(),
        constructor: () => Temporal.Now.plainDateISO().toString(),
      }),
    ),
  }).pipe(Schema.standardSchemaV1),
});

function RouteComponent() {
  const search = Route.useSearch();
  const data = Route.useLoaderData();

  return (
    <div class="mx-auto max-w-3xl px-6 py-10">
      <Editor noteId={search().date} isDaily={true} initial={data().initial} />
    </div>
  );
}
