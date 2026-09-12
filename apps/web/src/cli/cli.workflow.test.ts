import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import dedent from "dedent";
import { DateTime, Effect, Layer } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { describe, expect, it } from "vite-plus/test";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import * as DB from "../lib/db.service";
import * as EventRepo from "../lib/event.repo";
import * as Materializer from "../lib/materializer.service";
import * as NoteRepo from "../lib/note.repo";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import { MdParse } from "../lib/prosemirror/md/parse";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "../lib/prosemirror/yjs";
import { CliRuntime } from "./cli.runtime";

const APP_DIR = fileURLToPath(new URL("../..", import.meta.url));
const CLI_ENTRY = fileURLToPath(new URL("./cli.ts", import.meta.url));
const NOTE_ID = "workflow-note";

describe("CLI local workflow", () => {
  it(
    "executes files and stdin offline, reports pending changes, and fails sync cleanly",
    { timeout: 30_000 },
    async () => {
      const workspace = await mkdtemp(path.join(tmpdir(), "manotes-cli-workflow-"));
      try {
        const manotesDir = path.join(workspace, ".manotes");
        const databasePath = path.join(manotesDir, "db.sqlite");
        const fileScript = path.join(workspace, "file-edit.ts");
        await mkdir(manotesDir);
        await writeFile(
          path.join(manotesDir, "config"),
          JSON.stringify({
            origin: "http://127.0.0.1:1",
            token: "offline-test-token",
            graphId: "offline-test-graph",
            graphKey: Buffer.alloc(32).toString("base64"),
          }),
        );
        const note = await seedWorkspace(databasePath);
        const exportResult = await runCli(
          workspace,
          ["execute"],
          "export default async function () {}\n",
        );
        expect(exportResult.code, exportResult.stdout + exportResult.stderr).toBe(0);
        const initialFile = await readFile(path.join(workspace, `${NOTE_ID}.md`), "utf8");
        expect(initialFile).toBe(
          `${dedent`
          ---
          date: "${note.date}"
          updated_at: "2026-09-12T10:24:36.000Z"
          ---

          ---

          # Workflow

          Initial.
        `}\n`,
        );
        const reexportResult = await runCli(
          workspace,
          ["execute"],
          "export default async function () {}\n",
        );
        expect(reexportResult.code, reexportResult.stdout + reexportResult.stderr).toBe(0);
        expect(await readFile(path.join(workspace, `${NOTE_ID}.md`), "utf8")).toBe(initialFile);
        await writeFile(
          fileScript,
          dedent`
            export default async function (api) {
              await api.editNote("${NOTE_ID}", [
                { kind: "append", markdown: "From file." },
              ]);
            }
          `,
        );

        const fileResult = await runCli(workspace, ["execute", fileScript]);
        expect(fileResult.code, fileResult.stdout + fileResult.stderr).toBe(0);
        expect(fileResult.stdout).toContain("Local changes saved.");
        expect(fileResult.stdout).toContain("Pending publication: 1 changes");
        expect(await readFile(path.join(workspace, `${NOTE_ID}.md`), "utf8")).toContain(
          "From file.\n",
        );

        const stdinResult = await runCli(
          workspace,
          ["execute"],
          dedent`
            export default async function (api) {
              await api.editNote("${NOTE_ID}", [
                { kind: "append", markdown: "From stdin." },
              ]);
            }
          `,
        );
        expect(stdinResult.code, stdinResult.stdout + stdinResult.stderr).toBe(0);
        expect(stdinResult.stdout).toContain("Pending publication: 2 changes");

        const failedStdinResult = await runCli(
          workspace,
          ["execute"],
          'export default async function () { throw new Error("stdin failure"); }\n',
        );
        expect(failedStdinResult.code).not.toBe(0);
        expect(failedStdinResult.stderr).toContain("Execution failed.");
        expect((await readdir(manotesDir)).filter((name) => name.startsWith("execute-"))).toEqual(
          [],
        );

        const statusResult = await runCli(workspace, ["status"]);
        expect(statusResult.code).toBe(0);
        expect(statusResult.stdout).toContain("Pending publication: 2 changes");

        const syncResult = await runCli(workspace, ["sync"]);
        expect(syncResult.code).not.toBe(0);
        expect(syncResult.stderr).toContain("Sync failed.");
        expect(syncResult.stdout).toContain("Pending publication: 2 changes");
        expect(syncResult.stderr).toContain("Retry with `manotes sync`.");
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },
  );
});

async function seedWorkspace(databasePath: string) {
  const yDoc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    MdParse.parse(dedent`
      ---

      # Workflow

      Initial.
    `).toJSON(),
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );
  const update = Y.encodeStateAsUpdate(yDoc);
  yDoc.destroy();

  const configLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({ localGraphId: "offline-test-graph", databasePath }),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      const eventRepo = yield* EventRepo.Service;
      const materializer = yield* Materializer.Service;
      const event = yield* eventRepo.create({
        noteId: NOTE_ID,
        type: "update",
        payload: update,
        createdAt: DateTime.makeUnsafe("2026-09-12T10:24:36.000Z"),
        commitSeq: 1,
      });
      yield* materializer.materializeNoteUpTo({ noteId: NOTE_ID, upToLocalSeq: event.localSeq });
      const noteRepo = yield* NoteRepo.Service;
      return yield* noteRepo.getById(NOTE_ID);
    }).pipe(
      Effect.provide(CliRuntime.layer),
      Effect.provide(configLayer),
      Effect.provide(NodeServices.layer),
      Effect.provide(Reactivity.layer),
      Effect.scoped,
    ),
  );
}

type CliResult = {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runCli(workspace: string, args: readonly string[], input?: string): Promise<CliResult> {
  const { promise, resolve, reject } = Promise.withResolvers<CliResult>();
  const child = spawn(
    process.execPath,
    ["--import", "tsx", CLI_ENTRY, "--dir", workspace, ...args],
    { cwd: APP_DIR, timeout: 20_000 },
  );
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.once("error", reject);
  child.once("close", (code) => {
    resolve({ code, stdout, stderr });
  });
  child.stdin.end(input);

  return promise;
}
