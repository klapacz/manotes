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
  PaneActions,
  PaneEmptyState,
  PaneShell,
} from "./shared";
import { Focus } from "./focus";
import { DOMScroll } from "../../lib/dom-scroll";

const route = getRouteApi("/$graph/");

export function PaneNote(props: ComponentProps<"section">) {
  const navigate = route.useNavigate();
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

  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    syncFocusWithin: (element) => {
      if (DOMScroll.isCenteredInScrollParent(element)) return;

      element.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    },
    syncFocus(element) {
      element.focus({ preventScroll: true });
    },
  }));

  fnode.registerShortcuts([
    {
      key: [["Enter"]],
      handler: () => {
        fnode.focusNode(fid.editor(pane().id));

        return true;
      },
    },
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
      <PaneShell {...props}>
        <div class="flex justify-end">
          <PaneActions onCreate={handleCreate} />
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
                {(note) => <PaneNoteInner note={note()} />}
              </Show>
            ),
          }}
        />
      </PaneShell>
    </Focus.NodeProvider>
  );
}

function PaneNoteInner(props: { note: NoteSchema.Meta }) {
  return (
    <Focus.Element class="overflow-y-auto outline-none group">
      <NoteDivider date={props.note.date} />
      <NoteShell>
        <NoteActions note={props.note} sort="date" />
        <Editor noteId={props.note.id} style={{ "min-height": "30svh" }} />
      </NoteShell>
    </Focus.Element>
  );
}
