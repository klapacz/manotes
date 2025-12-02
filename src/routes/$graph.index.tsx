import { createFileRoute, Link, Outlet } from "@tanstack/solid-router";
import { createRuntimeStreamStore, NoteRepo, useRuntime } from "../lib";
import { DateTime, Effect, Stream } from "effect";
import { For } from "solid-js";

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
    <>
      <button
        class="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded"
        onClick={async () => {
          await runtime().runPromise(createNote);
        }}
      >
        Create
      </button>

      <Link from={Route.fullPath} to="/$graph/other">
        Go to other
      </Link>

      <Outlet />

      <ul>
        <For each={notes}>
          {(note) => {
            console.log("note rerun");
            return <li>{note.title}</li>;
          }}
        </For>
      </ul>
    </>
  );
}
