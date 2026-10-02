import { getRouteApi } from "@tanstack/solid-router";
import { Option, Stream } from "effect";
import { Errored, Loading, Show, createMemo } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import Editor from "../../editor";
import { NoteCache, NoteSchema } from "../../lib";
import { runStream } from "../../lib/solid-effect";
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

const route = getRouteApi("/$graph/");

export function PaneNote(props: ComponentProps<"section">) {
  const navigate = route.useNavigate();
  const focus = Focus.use();
  const createNote = NoteCreate.useCreateNote();

  const handleCreate = () =>
    createNote({}, (note) => void navigate(NoteLink.getOptions({ id: note.id })));

  const pane = PaneCtx.useNote();

  const note = createMemo(() =>
    runStream(
      NoteCache.Service.use((cache) => cache.changes(pane().id)).pipe(
        Stream.unwrap,
        Stream.map(Option.getOrNull),
      ),
    ),
  );

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
        <div class="flex justify-end">
          <PaneActions onCreate={handleCreate} />
        </div>
        <Errored fallback={<PaneEmptyState>Failed to load note.</PaneEmptyState>}>
          <Loading>
            <Show
              when={note()}
              // Loading holds this until the query answers, so a missing note
              // never flashes on pane open.
              fallback={<PaneEmptyState>Note not found.</PaneEmptyState>}
            >
              {(note) => <PaneNoteInner note={note()} />}
            </Show>
          </Loading>
        </Errored>
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
          <NoteActions note={props.note} sort="date" />
          <Editor noteId={props.note.id} style={{ "min-height": "30svh" }} />
        </NoteShell>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}
