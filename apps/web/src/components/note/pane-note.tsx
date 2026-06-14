import { Option, Stream } from "effect";
import { Show } from "solid-js";
import Editor from "../../editor";
import { MatchTag, NoteCache, bindRt, createAtomResultStore, createSyncedAtom } from "../../lib";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { NoteActions, NoteSeparator, PaneActions, PaneEmptyState, PaneShell } from "./shared";

export function PaneNote() {
  const pane = PaneCtx.useNote();
  const noteIdAtom = createSyncedAtom(() => pane().id);
  const notesAtom = bindRt((rt) =>
    rt.atom((get) =>
      NoteCache.Service.use((cache) => cache.changes(get(noteIdAtom))).pipe(
        Stream.unwrap,
        Stream.map(Option.getOrNull),
      ),
    ),
  );
  const note = createAtomResultStore(notesAtom);

  return (
    <PaneShell>
      <div class="flex justify-end">
        <PaneActions />
      </div>
      <MatchTag
        when={note}
        cases={{
          Loading: () => null,
          Error: () => <PaneEmptyState>Failed to load note.</PaneEmptyState>,
          Success: (state) => (
            <Show
              when={state().value}
              // Only claim the note is missing once the query has answered;
              // rendering the fallback while loading flashes it on every pane open.
              fallback={<PaneEmptyState>Note not found.</PaneEmptyState>}
            >
              {(note) => (
                <article class="overflow-y-auto">
                  <NoteSeparator dateString={note().date} />
                  <Editor
                    noteId={note().id}
                    style={{ "min-height": "30svh", "padding-top": "calc(var(--spacing)*6)" }}
                  />

                  <NoteActions note={note()} sort="date" />
                </article>
              )}
            </Show>
          ),
        }}
      />
    </PaneShell>
  );
}
