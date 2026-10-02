import { getRouteApi } from "@tanstack/solid-router";
import { Option, Stream } from "effect";
import { Show, type ComponentProps } from "solid-js";
import Editor from "../../editor";
import {
  MatchTag,
  NoteCache,
  NoteSchema,
  bindRt,
  createAtomResultStore,
  createSyncedAtom,
} from "../../lib";
import * as NoteLink from "../../lib/note/link";
import { NoteCreate } from "./note-create";
import { PaneCtx } from "../../lib/note/pane.ctx";
import {
  NoteActions,
  NoteDivider,
  NoteShell,
  PaneEmptyState,
  PaneHeader,
  PaneShell,
} from "./shared";
import { Focus } from "./focus";

const route = getRouteApi("/$graph/");

export function PaneNote(props: ComponentProps<"section">) {
  const navigate = route.useNavigate();
  const focus = Focus.use();
  const createNote = NoteCreate.useCreateNote();

  const handleCreate = () =>
    createNote({}, (note) => void navigate(NoteLink.getOptions({ id: note.id })));

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

  const fid = Focus.useId();

  // Entering the pane enters its only note, like a stream entering a row.
  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    focus: (element) => {
      element.focus({ preventScroll: true });
      focus.request(fid.note(pane().id));
    },
  }));

  fnode.registerShortcuts([
    {
      key: NoteCreate.shortcut,
      handler: () => {
        handleCreate();

        return true;
      },
    },
  ]);

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <PaneHeader onCreate={handleCreate} />
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
                {(note) => <PaneNoteInner note={note()} />}
              </Show>
            ),
          }}
        />
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

function PaneNoteInner(props: { note: NoteSchema.Meta }) {
  const fnode = Focus.createNoteNode(() => props.note.id);

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element class="overflow-y-auto outline-none group">
        <NoteDivider date={props.note.date} />
        <NoteShell>
          <NoteActions note={props.note} />
          <Editor noteId={props.note.id} style={{ "min-height": "30svh" }} />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
