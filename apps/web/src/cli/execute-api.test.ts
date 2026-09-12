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
import * as EventSchema from "../lib/event.schema";
import * as NoteRepo from "../lib/note.repo";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import { toLocalDateString } from "../lib/temporal/utils";
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
  it("saves a date event without changing content, and skips unchanged or cancelling dates", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* noteRepo.getById(NOTE_ID);

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [{ kind: "date", date: "2024-02-29" }]);
          }
        `);

        const after = yield* noteRepo.getById(NOTE_ID);
        expect(after.date).toBe("2024-02-29");
        expect(after.content).toEqual(before.content);
        expect(after.materializedYUpdate).toEqual(before.materializedYUpdate);
        expect(after.createdAt).toEqual(before.createdAt);
        const pending = yield* eventRepo.findPending(10);
        expect(pending).toHaveLength(1);
        const event = pending[0];

        if (!event) throw new Error("Expected a date event");
        expect(event.type).toBe("date");
        expect(yield* EventSchema.decodeDatePayload(Uint8Array.from(event.payload))).toEqual({
          date: "2024-02-29",
        });
        expect(after.updatedAt).toEqual(event.createdAt);

        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [{ kind: "date", date: "2024-02-29" }]);
            await api.editNote("${NOTE_ID}", [
              { kind: "date", date: "2025-01-01" },
              { kind: "date", date: "2024-02-29" },
            ]);
          }
        `);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(yield* noteRepo.getById(NOTE_ID)).toEqual(after);
      }),
    );
  });

  it("saves mixed edits using only the last date, ignoring an invalid earlier date", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        yield* runTestScript(dedent`
          export default async function (api) {
            await api.editNote("${NOTE_ID}", [
              { kind: "date", date: "2025-02-29" },
              { kind: "replace", text: "Alpha", with: "Beta" },
              { kind: "date", date: "2024-02-29" },
            ]);
          }
        `);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const note = yield* noteRepo.getById(NOTE_ID);
        expect(note.date).toBe("2024-02-29");
        expect(markdownFromContent(note.content)).toBe("# Plan\n\nBeta.\n");
        expect((yield* eventRepo.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
        ]);
      }),
    );
  });

  it("rejects an invalid final date, and rolls back dates when body edits fail", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* noteRepo.getById(NOTE_ID);

        for (const edits of [
          [
            { kind: "replace", text: "Alpha", with: "Beta" },
            { kind: "date", date: "2024-02-29" },
            { kind: "date", date: "2025-02-29" },
          ],
          [
            { kind: "date", date: "2024-02-29" },
            { kind: "replace", text: "missing", with: "never saved" },
          ],
        ]) {
          const result = yield* runTestScript(dedent`
            export default async function (api) {
              await api.editNote("${NOTE_ID}", ${JSON.stringify(edits)});
            }
          `).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          expect(yield* eventRepo.countPending()).toBe(0);
          expect(yield* noteRepo.getById(NOTE_ID)).toEqual(before);
        }
      }),
    );
  });

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

  it("exposes editing and creation and writes one event for an ordered edit batch", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const noteRepo = yield* NoteRepo.Service;

        expect(yield* eventRepo.countPending()).toBe(0);

        yield* runTestScript(dedent`
          export default async function (api) {
            if (Object.keys(api).sort().join(",") !== "createNote,editNote") throw new Error("unexpected API");
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

describe("ExecuteApi.createNote", () => {
  it("creates a supplied ID with ordered appends and the last date, then allows editing", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          export default async function (api) {
            const id = await api.createNote("created-note", [
              { kind: "date", date: "invalid but superseded" },
              { kind: "append", markdown: "# Created" },
              { kind: "append", markdown: "See [Target](./target.md)." },
              { kind: "date", date: "2024-02-29" },
            ]);
            if (id !== "created-note") throw new Error("unexpected ID");
            await api.editNote(id, [{ kind: "append", markdown: "Next." }]);
          }
        `);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const note = yield* noteRepo.getById("created-note");
        expect(note.title).toBe("Created");
        expect(note.date).toBe("2024-02-29");
        const markdown = "# Created\n\nSee [target](./target.md).\n\nNext.\n";
        expect(markdownFromContent(note.content)).toBe(markdown);
        const updates = yield* eventRepo.findUpdatesForNote(note.id);
        expect(markdownAfterReplay(updates.map((event) => event.payload))).toBe(markdown);
        expect((yield* eventRepo.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
          "update",
        ]);
      }),
    );
  });

  it("generates distinct IDs and persists empty and date-only notes", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          export default async function (api) {
            const first = await api.createNote(undefined, []);
            const second = await api.createNote(undefined, [{ kind: "date", date: "2024-02-29" }]);
            if (!first || !second || first === second) throw new Error("invalid generated IDs");
            await api.editNote(first, [{ kind: "append", markdown: "Generated." }]);
          }
        `);
        const noteRepo = yield* NoteRepo.Service;
        const notes = yield* noteRepo.findAllRecords();
        expect(notes).toHaveLength(2);
        const dated = notes.find((note) => note.date === "2024-02-29");
        expect(dated).toBeDefined();
        expect(markdownFromContent(dated!.content).trim()).toBe("");
        const generated = notes.find((note) => note.id !== dated!.id);
        expect(markdownFromContent(generated!.content)).toBe("Generated.\n");
        expect(generated!.date).toBe(toLocalDateString(generated!.createdAt));
      }),
    );
  });

  it("rejects empty IDs, replacement actions, and invalid final dates without saving", async () => {
    await runIntegration(
      Effect.gen(function* () {
        for (const call of [
          'api.createNote("", [])',
          'api.createNote("invalid", [{ kind: "replace", text: "", with: "no" }])',
          'api.createNote("invalid", [{ kind: "append", markdown: "Not saved" }, { kind: "date", date: "2025-02-29" }])',
        ]) {
          const result = yield* runTestScript(
            `export default async (api) => { await ${call}; };`,
          ).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
        }

        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        expect(yield* noteRepo.findAllRecords()).toEqual([]);
        expect(yield* eventRepo.countPending()).toBe(0);
      }),
    );
  });

  it("rejects existing IDs, including notes with only unmaterialized events", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedNote(NOTE_ID, INITIAL_MARKDOWN);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* noteRepo.getById(NOTE_ID);
        yield* eventRepo.create({
          noteId: "unmaterialized",
          type: "update",
          payload: fullUpdateFromMarkdown("Existing."),
          createdAt: yield* DateTime.now,
        });

        for (const id of [NOTE_ID, "unmaterialized"]) {
          const result = yield* runTestScript(dedent`
            export default async function (api) {
              await api.createNote("${id}", [{ kind: "append", markdown: "Never saved." }]);
            }
          `).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);

          if (Result.isFailure(result))
            expect(String(result.failure)).toContain(`Note already exists: ${id}`);
        }

        expect(yield* noteRepo.getById(NOTE_ID)).toEqual(before);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(yield* eventRepo.findUpdatesForNote("unmaterialized")).toHaveLength(1);
      }),
    );
  });

  it("allows only one concurrent creation for a supplied ID", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          export default async function (api) {
            const results = await Promise.allSettled([
              api.createNote("same-id", [{ kind: "append", markdown: "First." }]),
              api.createNote("same-id", [{ kind: "append", markdown: "Second." }]),
            ]);
            if (results.filter((result) => result.status === "fulfilled").length !== 1) {
              throw new Error("Expected one successful creation");
            }
          }
        `);
        const noteRepo = yield* NoteRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        expect(yield* noteRepo.findAllRecords()).toHaveLength(1);
        expect(yield* eventRepo.countPending()).toBe(2);
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
