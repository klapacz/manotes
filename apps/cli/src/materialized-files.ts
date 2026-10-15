import path from "node:path";
import { DateTime, Effect, FileSystem } from "effect";
import { RECORD_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import * as RecordRepo from "@manotes/shared/record.repo";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { CliPaths } from "./cli.paths";
import { MdSerialize } from "@manotes/shared/prosemirror/md/serialize";
import { BacklinkLabels } from "./backlink-labels";

/**
 * Renders every note to a `.md` file. Local markdown is output-only; it is not
 * reconciled back into the graph.
 */
export const writeAll = Effect.fn("MaterializedFiles.writeAll")(function* () {
  const workspacePaths = yield* CliPaths.Service;
  const fs = yield* FileSystem.FileSystem;
  const recordRepo = yield* RecordRepo.Service;

  const records = yield* recordRepo.findAllNotes();
  const cache = BacklinkLabels.buildCache(records);

  yield* Effect.forEach(
    records,
    Effect.fnUntraced(function* (record) {
      const doc = RECORD_SCHEMA.nodeFromJSON(record.content);
      const body = MdSerialize.serialize(doc, { backlinkLabel: (id) => cache.get(id) });
      const content = formatFile(record, body);

      const filePath = path.join(workspacePaths.dir, `${record.id}.md`);
      const tempPath = `${filePath}.tmp`;
      yield* fs.writeFileString(tempPath, content);
      yield* fs.rename(tempPath, filePath);
    }),
  );
});

// Metadata belongs to the exported file, not the editable ProseMirror body.
function formatFile(record: Pick<RecordSchema.Record, "date" | "updatedAt">, body: string): string {
  return `---\ndate: "${record.date}"\nmodified: "${DateTime.formatIso(record.updatedAt)}"\n---\n\n${body}`;
}

export * as MaterializedFiles from "./materialized-files.ts";
