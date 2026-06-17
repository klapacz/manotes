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

export function PaneNote(props: ComponentProps<"section">) {
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
  const fnode = Focus.createNode((ctx) => ({
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
    onKeyDown: (event) => {
      if (event.key !== "Enter") return;
      ctx.focusNode(fid.editor(pane().id));
      return true;
    },
  }));

  return (
    <Focus.NodeProvider node={fnode}>
      <PaneShell {...props}>
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
    <div>
      <NoteDivider date={props.note.date} />
      <Focus.Element as={NoteShell} class="overflow-y-auto outline-none group">
        <NoteActions note={props.note} sort="date" />
        <Editor noteId={props.note.id} style={{ "min-height": "30svh" }} />
      </Focus.Element>
    </div>
  );
}
