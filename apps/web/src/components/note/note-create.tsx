import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { toast } from "somoto";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import { MaterializedEventService, NoteSchema, bindRt } from "../../lib";
import type { PaneSchema } from "../../lib/note/pane.schema";
import type { Hotkey } from "@tanstack/hotkeys";
import { NOTE_SCHEMA } from "../../lib/prosemirror/app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "../../lib/prosemirror/yjs";
import type { EditorPool } from "./editor-pool";

const EMPTY_YJS_UPDATE = Y.encodeStateAsUpdate(new Y.Doc());

export type CreateInput = {
  date?: string;
  payload?: Uint8Array<ArrayBufferLike>;
  // When given, the new note's editor is booted into the pool so the row it
  // lands in reattaches the live ProseMirror DOM instead of rebooting.
  pool?: EditorPool.Pool;
};

const CreateNote = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteCreate.createNote")(function* (input: CreateInput) {
      const service = yield* MaterializedEventService.Service;

      const note = yield* service.create({
        noteId: nanoid(),
        payload: input.payload ?? EMPTY_YJS_UPDATE,
        createdAt: yield* DateTime.now,
        date: input.date,
      });

      if (input.pool) yield* input.pool.preload([note.id]);

      return note;
    }),
  ),
);

/** Creates a note, surfacing progress through a toast and running `onCreated`. */
export function useCreateNote() {
  const [, createNote] = useAtom(CreateNote, { mode: "promise" });

  return (input: CreateInput, onCreated?: (note: NoteSchema.Record) => void) =>
    toast.promise(
      createNote(input).then((note) => {
        onCreated?.(note);
        return note;
      }),
      {
        loading: "Creating...",
        success: () => "Note created",
        error: "Error while creating note",
      },
    );
}

/** The keybinding that triggers note creation on a pane's focus node. */
export const shortcut: Hotkey[][] = [["Mod+Enter"]];

/** Builds a page payload: a note whose title materializes from a leading H1. */
export function pagePayload(title: string): Uint8Array<ArrayBufferLike> {
  const yDoc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    {
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] }],
    },
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );

  return Y.encodeStateAsUpdate(yDoc);
}

/** Seeds a new note's content from the stream pane's filters. */
export function prefilledPayload(pane: PaneSchema.PaneStream): Uint8Array<ArrayBufferLike> {
  const content: Array<Record<string, unknown>> = [];

  if (pane.filter.type === "pages") {
    content.push({
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Untitled" }],
    });
  }

  if (pane.filter.backlinksTo !== undefined) {
    content.push({
      type: "paragraph",
      content: [{ type: "backlink", attrs: { id: pane.filter.backlinksTo } }],
    });
  }

  if (content.length === 0) return EMPTY_YJS_UPDATE;

  const yDoc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    { type: "doc", content },
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );

  return Y.encodeStateAsUpdate(yDoc);
}

export * as NoteCreate from "./note-create";
