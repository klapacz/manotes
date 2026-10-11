import { useAtom } from "@effect/atom-solid";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { toast } from "somoto";
import { MaterializedEventService, NoteSchema, bindRt } from "../../lib";
import type { PaneSchema } from "@manotes/shared/note/pane.schema";
import type { UnknownNodeJSON } from "@manotes/shared/node-json";
import type { Hotkey } from "@tanstack/hotkeys";
import { ProsemirrorEncode } from "@manotes/shared/prosemirror/encode";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { NoteDoc } from "@manotes/shared/note/doc";
import * as Y from "yjs";
import type { EditorPool } from "./editor-pool";

export type CreateInput = {
  date?: string;
  payload?: Uint8Array<ArrayBufferLike>;
  pane?: PaneSchema.PaneStream;
  // When given, the new note's editor is booted into the pool so the row it
  // lands in reattaches the live ProseMirror DOM instead of rebooting.
  pool?: EditorPool.Pool;
};

const CreateNote = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteCreate.createNote")(function* (input: CreateInput) {
      const service = yield* MaterializedEventService.Service;
      const payload = yield* resolvePayload(input);

      const note = yield* service.create({
        noteId: nanoid(),
        payload,
        createdAt: yield* DateTime.now,
        date: input.date,
      });

      if (input.pool) yield* input.pool.preload([note.id]);

      return note;
    }),
  ),
);

const resolvePayload = Effect.fn("ComponentsNoteNoteCreate.resolvePayload")(function* (
  input: CreateInput,
) {
  if (input.payload !== undefined) {
    return input.payload;
  }

  if (input.pane !== undefined) {
    return yield* prefilledPayload(input.pane);
  }

  return ProsemirrorEncode.encodeDocument([{ type: "paragraph" }]);
});

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
  return ProsemirrorEncode.encodeDocument([
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
  ]);
}

/** Seeds a new note's content from the stream pane's filters. */
export const prefilledPayload = Effect.fn("ComponentsNoteNoteCreate.prefilledPayload")(function* (
  pane: PaneSchema.PaneStream,
) {
  const content = new Array<UnknownNodeJSON>();

  if (pane.filter.type === "pages" || pane.filter.type === "prop") {
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

  if (content.length === 0) content.push({ type: "paragraph" });

  const { doc } = yield* Effect.acquireRelease(
    Effect.sync(() => NoteDoc.make()),
    ({ doc }) => Effect.sync(() => doc.destroy()),
  );

  yield* Effect.sync(() => ProsemirrorEncode.initializeDocument({ doc, content }));

  if (pane.filter.type === "prop") {
    const attrs = yield* Attrs.Service;
    yield* attrs.initializeProp({
      doc,
      defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
    });
  }

  return yield* Effect.sync(() => Y.encodeStateAsUpdate(doc));
}, Effect.scoped);

export * as NoteCreate from "./note-create";
