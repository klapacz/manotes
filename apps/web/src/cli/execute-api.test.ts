import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeServices } from "@effect/platform-node";
import dedent from "dedent";
import { DateTime, Effect, Layer, Result } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { describe, expect, it } from "vite-plus/test";
import { initProseMirrorDoc, prosemirrorJSONToYDoc, updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import * as DB from "../lib/db.service";
import * as EventRepo from "../lib/event.repo";
import * as Materializer from "../lib/materializer.service";
import type { UnknownNodeJSON } from "../lib/node-json";
import * as NoteRepo from "../lib/note.repo";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import { MdParse } from "../lib/prosemirror/md/parse";
import { MdSerialize } from "../lib/prosemirror/md/serialize";
import { getProsemirrorXmlFragment, PROSEMIRROR_XML_FRAGMENT_KEY } from "../lib/prosemirror/yjs";
import { CliRuntime } from "./cli.runtime";
import { ExecuteApi } from "./execute-api";
import { BacklinkLabels } from "./backlink-labels";

const NOTE_ID = "note-1";
const INITIAL_MARKDOWN = dedent`
  # Plan

  Alpha.
`;

type RuntimeServices = DB.Service | EventRepo.Service | Materializer.Service | NoteRepo.Service;

describe("ExecuteApi.editNote", () => {
  it("matches exported backlink labels and preserves their destination IDs", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote("linked-note", "# Manotes");
        yield* seedNote(
          NOTE_ID,
          "Sync [Manotes](./linked-note.md) and [missing](./missing.md).",
          2,
        );
        const noteRepo = yield* NoteRepo.Service;
        const labels = BacklinkLabels.buildCache(yield* noteRepo.findAllRecords());
        const note = yield* noteRepo.getById(NOTE_ID);
        const exported = MdSerialize.serialize(NOTE_SCHEMA.nodeFromJSON(note.content), {
          backlinkLabel: (id) => labels.get(id),
        });
        expect(exported).toBe("Sync [Manotes](./linked-note.md) and [missing](./missing.md).\n");

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [{
              kind: "replace",
              text: ${JSON.stringify(exported.trimEnd())},
              with: ${JSON.stringify(`- [ ] ${exported.trimEnd()}`)},
            }]);
          }
        `);

        const updated = yield* noteRepo.getById(NOTE_ID);
        expect(markdownFromContent(updated.content)).toBe(
          "- [ ] Sync [linked-note](./linked-note.md) and [missing](./missing.md).\n",
        );
      }),
    );
  });

  it("exposes only editNote and writes one event for an ordered edit batch", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        expect(yield* eventRepo.countPending()).toBe(0);

        yield* runTestScript(dedent`
          export default async function (api) {
            if (Object.keys(api).join(",") !== "editNote") throw new Error("unexpected API");
            await api.editNote("${NOTE_ID}", [
              { kind: "replace", text: "Alpha", with: "Beta" },
              { kind: "append", markdown: "Beta follows." },
              { kind: "replace", text: "Beta", with: "Done", occurrence: "all" },
            ]);
          }
        `);

        const events = yield* eventRepo.findUpdatesForNote(NOTE_ID);
        const note = yield* noteRepo.getById(NOTE_ID);
        const expected = `${dedent`
          # Plan

          Done.

          Done follows.
        `}\n`;

        expect(events).toHaveLength(2);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(markdownFromContent(note.content)).toBe(expected);
        expect(markdownAfterReplay(events.map((event) => event.payload))).toBe(expected);
        expect(stateVectorAfterReplay(events.map((event) => event.payload))).toEqual(
          stateVectorAfterReplay([requireSnapshot(note.materializedYUpdate)]),
        );
        yield* eventRepo.markCommitted({ eventId: events[1]!.id, commitSeq: 2 });
        expect(yield* eventRepo.countPending()).toBe(0);
      }),
    );
  });

  it("lets sequential calls edit the latest materialized content", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [{ kind: "replace", text: "Alpha", with: "Beta" }]);
            await api.editNote("${NOTE_ID}", [{ kind: "replace", text: "Beta", with: "Gamma" }]);
          }
        `);

        const events = yield* eventRepo.findUpdatesForNote(NOTE_ID);
        const note = yield* noteRepo.getById(NOTE_ID);

        expect(events).toHaveLength(3);
        expect(markdownFromContent(note.content)).toBe(
          `${dedent`
          # Plan

          Gamma.
        `}\n`,
        );
      }),
    );
  });

  it("serializes concurrent calls without losing either edit", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        yield* runTestScript(dedent`
          export default async function (api) {
            await Promise.all([
              api.editNote("${NOTE_ID}", [{ kind: "append", markdown: "First concurrent append." }]),
              api.editNote("${NOTE_ID}", [{ kind: "append", markdown: "Second concurrent append." }]),
            ]);
          }
        `);

        const events = yield* eventRepo.findUpdatesForNote(NOTE_ID);
        const markdown = markdownFromContent((yield* noteRepo.getById(NOTE_ID)).content);

        expect(events).toHaveLength(3);
        expect(markdown).toContain("First concurrent append.\n");
        expect(markdown).toContain("Second concurrent append.\n");
      }),
    );
  });

  it("does not write events for no-op or cancelling edits", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [{ kind: "replace", text: "Alpha", with: "Alpha" }]);
            await api.editNote("${NOTE_ID}", [
              { kind: "replace", text: "Alpha", with: "Beta" },
              { kind: "replace", text: "Beta", with: "Alpha" },
            ]);
          }
        `);

        expect(yield* eventRepo.findUpdatesForNote(NOTE_ID)).toHaveLength(1);
        expect(markdownFromContent((yield* noteRepo.getById(NOTE_ID)).content)).toBe(
          `${INITIAL_MARKDOWN}\n`,
        );
      }),
    );
  });

  it("rolls back the whole batch when a later edit fails", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        const result = yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [
              { kind: "replace", text: "Alpha", with: "Beta" },
              { kind: "replace", text: "missing", with: "never saved" },
            ]);
          }
        `).pipe(Effect.result);
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) expect(String(result.failure)).toMatch(/found 0/);

        expect(yield* eventRepo.findUpdatesForNote(NOTE_ID)).toHaveLength(1);
        expect(markdownFromContent((yield* noteRepo.getById(NOTE_ID)).content)).toBe(
          `${INITIAL_MARKDOWN}\n`,
        );
      }),
    );
  });

  it("catches up an unmaterialized event before editing", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const seeded = yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;
        const pendingMarkdown = dedent`
          # Plan

          Remote pending.
        `;

        const pending = yield* eventRepo.create({
          noteId: NOTE_ID,
          type: "update",
          payload: deltaFromMarkdown(seeded.update, pendingMarkdown),
          createdAt: yield* DateTime.now,
        });

        expect((yield* noteRepo.getById(NOTE_ID)).lastEventLocalSeq).toBe(seeded.localSeq);

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [
              { kind: "replace", text: "Remote pending", with: "Caught up" },
            ]);
          }
        `);

        const events = yield* eventRepo.findUpdatesForNote(NOTE_ID);
        const note = yield* noteRepo.getById(NOTE_ID);

        expect(events).toHaveLength(3);
        expect(note.lastEventLocalSeq).toBeGreaterThan(pending.localSeq);
        expect(markdownFromContent(note.content)).toBe(
          `${dedent`
          # Plan

          Caught up.
        `}\n`,
        );
      }),
    );
  });
});

describe("ExecuteApi.runScript", () => {
  it("requires a default function", async () => {
    await expect(runIntegration(runTestScript("export const edit = true;\n"))).rejects.toThrow(
      /must export a default function/,
    );
  });
});

function runTestScript(source: string) {
  return Effect.scoped(
    Effect.gen(function* () {
      const workspace = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(path.join(tmpdir(), "manotes-test-script-"))),
        (workspace) => Effect.promise(() => rm(workspace, { recursive: true, force: true })),
      );
      const scriptPath = path.join(workspace, "edit.ts");
      yield* Effect.promise(() => writeFile(scriptPath, source));
      yield* ExecuteApi.runScript(scriptPath);
    }),
  );
}

function seedNote(noteId: string, markdown: string, commitSeq = 1) {
  const update = fullUpdateFromMarkdown(markdown);

  return Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const materializer = yield* Materializer.Service;
    const event = yield* eventRepo.create({
      noteId,
      type: "update",
      payload: update,
      createdAt: yield* DateTime.now,
      commitSeq,
    });

    yield* materializer.materializeNoteUpTo({ noteId, upToLocalSeq: event.localSeq });
    return { localSeq: event.localSeq, update };
  });
}

function fullUpdateFromMarkdown(markdown: string): Uint8Array<ArrayBufferLike> {
  const yDoc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    MdParse.parse(markdown).toJSON(),
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );
  try {
    return Y.encodeStateAsUpdate(yDoc);
  } finally {
    yDoc.destroy();
  }
}

function deltaFromMarkdown(
  baseUpdate: Uint8Array<ArrayBufferLike>,
  markdown: string,
): Uint8Array<ArrayBufferLike> {
  const yDoc = new Y.Doc();
  try {
    Y.applyUpdate(yDoc, baseUpdate);
    const fragment = getProsemirrorXmlFragment(yDoc);
    const { meta } = initProseMirrorDoc(fragment, NOTE_SCHEMA);
    const stateVector = Y.encodeStateVector(yDoc);
    updateYFragment(yDoc, fragment, MdParse.parse(markdown), meta);
    return Y.encodeStateAsUpdate(yDoc, stateVector);
  } finally {
    yDoc.destroy();
  }
}

function markdownAfterReplay(updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>): string {
  const yDoc = replay(updates);
  try {
    return MdSerialize.serialize(
      initProseMirrorDoc(getProsemirrorXmlFragment(yDoc), NOTE_SCHEMA).doc,
    );
  } finally {
    yDoc.destroy();
  }
}

function stateVectorAfterReplay(
  updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>,
): ReadonlyArray<number> {
  const yDoc = replay(updates);
  try {
    return Array.from(Y.encodeStateVector(yDoc));
  } finally {
    yDoc.destroy();
  }
}

function replay(updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>): Y.Doc {
  const yDoc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(yDoc, update);
  return yDoc;
}

function markdownFromContent(content: UnknownNodeJSON): string {
  return MdSerialize.serialize(NOTE_SCHEMA.nodeFromJSON(content));
}

function requireSnapshot(update: Uint8Array<ArrayBufferLike> | null): Uint8Array<ArrayBufferLike> {
  if (update === null) throw new Error("Expected a materialized Yjs snapshot");
  return update;
}

async function runIntegration(
  program: Effect.Effect<void, unknown, RuntimeServices>,
): Promise<void> {
  await withTempWorkspace(async (workspace) => {
    const configLayer = Layer.succeed(
      DB.Config,
      DB.Config.of({
        localGraphId: "test-graph",
        databasePath: path.join(workspace, "db.sqlite"),
      }),
    );

    await Effect.runPromise(
      program.pipe(
        Effect.provide(CliRuntime.layer),
        Effect.provide(configLayer),
        Effect.provide(NodeServices.layer),
        Effect.provide(Reactivity.layer),
        Effect.scoped,
      ),
    );
  });
}

async function withTempWorkspace<A>(use: (workspace: string) => Promise<A>): Promise<A> {
  const workspace = await mkdtemp(path.join(tmpdir(), "manotes-execute-api-"));
  try {
    return await use(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
