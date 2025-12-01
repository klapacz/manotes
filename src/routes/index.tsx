import { createFileRoute } from "@tanstack/solid-router";

import { For } from "solid-js";
import { DateTime, Effect, Stream } from "effect";
import { createStreamStore, NoteRepo, Runtime } from "../lib";

export const Route = createFileRoute("/")({
  component: IndexComponent,
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

function IndexComponent() {
  const notes = createStreamStore(
    Runtime.runtime,
    NoteRepo.Service.pipe(
      Effect.flatMap((service) => service.reactiveList()),
      Stream.unwrap,
    ),
    [],
  );

  return (
    <>
      <button
        class="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded"
        onClick={async () => {
          await Runtime.runtime.runPromise(createNote);
        }}
      >
        Create
      </button>

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
