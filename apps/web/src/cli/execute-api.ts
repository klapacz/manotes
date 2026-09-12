import path from "node:path";
import { pathToFileURL } from "node:url";
import { Array, DateTime, Effect, FileSystem, flow, Option, Schema } from "effect";
import { tsImport } from "tsx/esm/api";
import * as Y from "yjs";
import { initProseMirrorDoc, updateYFragment } from "y-prosemirror";
import * as DB from "../lib/db.service";
import * as EventRepo from "../lib/event.repo";
import * as EventSchema from "../lib/event.schema";
import { PlainDateString } from "../lib/temporal.schema";
import * as Materializer from "../lib/materializer.service";
import * as NoteRepo from "../lib/note.repo";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import { getProsemirrorXmlFragment } from "../lib/prosemirror/yjs";
import { CliPaths } from "./cli.paths";
import { EditDocument } from "./edit-document";
import { BacklinkLabels } from "./backlink-labels";

export type Edit = EditDocument.Edit | { readonly kind: "date"; readonly date: string };

export type Api = {
  readonly editNote: (id: string, edits: readonly Edit[]) => Promise<void>;
};

export const runScript = Effect.fn("ExecuteApi.runScript")(function* (scriptPath: string) {
  const api = yield* makeApi();
  yield* Effect.tryPromise({
    try: async () => {
      const module = await tsImport(pathToFileURL(scriptPath).href, { parentURL: import.meta.url });
      // Outside a type:module package, tsx may wrap a TypeScript default export in
      // CommonJS exports. Accept that wrapper as well as a native ESM default.
      const run = typeof module.default === "function" ? module.default : module.default?.default;
      if (typeof run !== "function") {
        throw new Error("Execute script must export a default function receiving the Manotes API");
      }
      await run(api);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
});

export const acquireStdinScript = Effect.fn("ExecuteApi.acquireStdinScript")(function* () {
  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const paths = yield* CliPaths.Service;
      const fs = yield* FileSystem.FileSystem;
      const script = yield* fs.readFileString("/dev/stdin");
      const scriptPath = path.join(paths.manotesDir, `execute-${process.pid}-${Date.now()}.ts`);

      yield* fs.writeFileString(scriptPath, script, { mode: 0o600 });
      return scriptPath;
    }),
    Effect.fnUntraced(function* (scriptPath) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(scriptPath, { force: true }).pipe(Effect.ignore);
    }),
  );
});
const makeApi = Effect.fn("ExecuteApi.makeApi")(function* () {
  const db = yield* DB.Service;
  const noteRepo = yield* NoteRepo.Service;
  const eventRepo = yield* EventRepo.Service;
  const materializer = yield* Materializer.Service;

  const editNote = Effect.fn("ExecuteApi.editNote")(function* (id: string, edits: readonly Edit[]) {
    // Read, edit, and save in one SQLite transaction. A concurrent writer cannot
    // slip between a separate stale check and the insert; a lock conflict fails.
    yield* db.transaction(
      Effect.gen(function* () {
        // Include events left by an interrupted command before taking the snapshot.
        yield* materializer.materializeNoteUpTo({
          noteId: id,
          upToLocalSeq: yield* eventRepo.getMaxLocalSeq(),
        });
        const note = yield* noteRepo.findByIdWithBacklinks(id);
        if (Option.isNone(note)) return yield* Effect.fail(new Error(`Note not found: ${id}`));
        const { record, backlinks } = note.value;

        // Resolve metadata separately; only body edits go through Yjs.
        const resolved = yield* resolveEdits(edits);
        const date = Option.filter(resolved.date, (date) => date !== record.date);

        // Match the same backlink labels shown in exported Markdown.
        const bodyUpdate = yield* createBodyUpdate(
          record.materializedYUpdate,
          resolved.bodyEdits,
          BacklinkLabels.buildCache(backlinks),
        );

        // No effective change means no events and no updated-at change.
        if (bodyUpdate === null && Option.isNone(date)) return;

        const createdAt = yield* DateTime.now;
        let upToLocalSeq = record.lastEventLocalSeq;
        if (bodyUpdate !== null) {
          const event = yield* eventRepo.create({
            noteId: id,
            type: "update",
            payload: bodyUpdate,
            createdAt,
          });
          upToLocalSeq = event.localSeq;
        }

        if (Option.isSome(date)) {
          const event = yield* eventRepo.create({
            noteId: id,
            type: "date",
            payload: yield* EventSchema.encodeDatePayload({ date: date.value }),
            createdAt,
          });
          upToLocalSeq = event.localSeq;
        }

        // Reuse production derivation for content, title, text, and backlinks.
        // The next editNote call sees this update even before Markdown is written.
        yield* materializer.materializeNoteUpTo({ noteId: id, upToLocalSeq });
      }),
    );
  });

  return { editNote: (id, edits) => Effect.runPromise(editNote(id, edits)) } satisfies Api;
});

const resolveEdits = Effect.fn("ExecuteApi.resolveEdits")(function* (edits: readonly Edit[]) {
  const date = yield* Array.findLast(edits, (edit) => edit.kind === "date").pipe(
    Option.map((edit) => edit.date),
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: flow(Schema.decodeUnknownEffect(PlainDateString), Effect.asSome),
    }),
  );
  const bodyEdits = Array.filter(edits, (edit) => edit.kind !== "date");
  return { date, bodyEdits };
});

const createBodyUpdate = Effect.fn("ExecuteApi.createBodyUpdate")(function* (
  snapshot: Uint8Array<ArrayBufferLike> | null,
  edits: readonly EditDocument.Edit[],
  labels: ReadonlyMap<string, string>,
) {
  if (edits.length === 0) return null;

  // Only encoded bytes leave this scope; the private Yjs document is destroyed
  // before the caller persists any events, including when editing fails.
  const yDoc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (yDoc) => Effect.sync(() => yDoc.destroy()),
  );
  if (snapshot !== null) Y.applyUpdate(yDoc, snapshot);
  const fragment = getProsemirrorXmlFragment(yDoc);
  const { doc, meta } = initProseMirrorDoc(fragment, NOTE_SCHEMA);
  const updated = yield* Effect.try({
    try: () => EditDocument.apply(doc, edits, { backlinkLabel: (id) => labels.get(id) }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
  // Empty Yjs updates still have bytes. Document equality also catches edits
  // that cancel each other out.
  if (updated.eq(doc)) return null;

  const stateVector = Y.encodeStateVector(yDoc);
  updateYFragment(yDoc, fragment, updated, meta);
  return Y.encodeStateAsUpdate(yDoc, stateVector);
}, Effect.scoped);

export * as ExecuteApi from "./execute-api.ts";
