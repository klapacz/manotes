import { useAtom } from "@effect/atom-solid";
import { getRouteApi } from "@tanstack/solid-router";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import { MaterializedEventService, bindRt } from "../lib";
import * as NoteLink from "../lib/note/link";
import { GraphMenu } from "./graph-menu";
import { PlusIcon, SearchIcon } from "./icons";
import { NoteSearchCommand } from "./note-search-command";
import { SyncStatusIndicator } from "./sync-status-indicator";
import { Button } from "./ui/button";
import { WorkerHealthBanner } from "./worker-health-banner";

const route = getRouteApi("/$graph/");

const EMPTY_YJS_UPDATE = Y.encodeStateAsUpdate(new Y.Doc());

const CreateNote = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsGraphNavbar.createNote")(function* (_: void) {
      const service = yield* MaterializedEventService.Service;
      return yield* service.create({
        noteId: nanoid(),
        payload: EMPTY_YJS_UPDATE,
        createdAt: yield* DateTime.now,
      });
    }),
  ),
);

export function GraphNavbar() {
  const navigate = route.useNavigate();
  const [createNoteResult, createNote] = useAtom(CreateNote, { mode: "promise" });

  async function handleCreateNote() {
    try {
      const note = await createNote();
      void navigate(NoteLink.getOptions({ id: note.id }));
    } catch {}
  }

  return (
    <div class="z-20 border-b border-border-subtle">
      <div class="flex flex-wrap items-center gap-2 px-4 py-2">
        <GraphMenu />
        <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SyncStatusIndicator />
          <WorkerHealthBanner />
          <NoteSearchCommand>
            {(openSearch) => (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={openSearch}
                title="Search notes (Ctrl+K)"
              >
                <SearchIcon />
              </Button>
            )}
          </NoteSearchCommand>
          <Button
            size="icon-sm"
            onClick={() => void handleCreateNote()}
            disabled={createNoteResult().waiting}
            title="Create note"
          >
            <PlusIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
