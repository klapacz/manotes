import { createFileRoute, Link, Outlet } from "@tanstack/solid-router";
import {
  createRuntimeStreamStore,
  NoteRepo,
  NoteSchema,
  useRuntime,
} from "../lib";
import { DateTime, Effect, Stream } from "effect";
import { For } from "solid-js";
import Editor from "../editor";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
});

const createNote = Effect.gen(function* () {
  const note = yield* NoteRepo.Service;
  yield* note.create({
    title: "New Note",
    content: { type: "doc", content: [] },
    createdAt: yield* DateTime.now,
    updatedAt: yield* DateTime.now,
  });
});

function RouteComponent() {
  const runtime = useRuntime();

  const notes = createRuntimeStreamStore(
    () =>
      NoteRepo.Service.pipe(
        Effect.flatMap((noteRepo) => noteRepo.reactiveList()),
        Stream.unwrap,
      ),
    [],
  );

  return (
    <div class="p-6 flex flex-col gap-4">
      <div class="flex gap-2 justify-between">
        <button
          class="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded"
          onClick={async () => {
            await runtime().runPromise(createNote);
          }}
        >
          Create
        </button>

        <Link
          from={Route.fullPath}
          to="/$graph/other"
          class="bg-gray-500 hover:bg-gray-700 text-white py-2 px-4 rounded"
        >
          Go to other
        </Link>
      </div>

      <Outlet />

      <ul>
        <For each={notes}>
          {(note) => {
            return <Note note={note} />;
          }}
        </For>
      </ul>
    </div>
  );
}

function Note(props: { note: typeof NoteSchema.Record.Type }) {
  return (
    <div>
      <h1>{props.note.title}</h1>
      <Editor note={props.note} />
    </div>
  );
}
