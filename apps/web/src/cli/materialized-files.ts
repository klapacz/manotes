import path from "node:path";
import { Effect, FileSystem } from "effect";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import * as NoteRepo from "../lib/note.repo";
import { CliPaths } from "./cli.paths";
import { MdSerialize } from "../lib/prosemirror/md/serialize";
import { BacklinkLabels } from "./backlink-labels";

/**
 * Renders every note to a `.md` file. Local markdown is output-only; it is not
 * reconciled back into the graph.
 */
export const writeAll = Effect.fn("MaterializedFiles.writeAll")(function* () {
  const workspacePaths = yield* CliPaths.Service;
  const fs = yield* FileSystem.FileSystem;
  const noteRepo = yield* NoteRepo.Service;

  const records = yield* noteRepo.findAllRecords();
  const cache = BacklinkLabels.buildCache(records);

  yield* Effect.forEach(
    records,
    Effect.fnUntraced(function* (record) {
      const doc = NOTE_SCHEMA.nodeFromJSON(record.content);
      const content = MdSerialize.serialize(doc, { backlinkLabel: (id) => cache.get(id) });

      const filePath = path.join(workspacePaths.dir, `${record.id}.md`);
      const tempPath = `${filePath}.tmp`;
      yield* fs.writeFileString(tempPath, content);
      yield* fs.rename(tempPath, filePath);
    }),
  );
});

export * as MaterializedFiles from "./materialized-files.ts";
