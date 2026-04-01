import { Effect } from "effect";
import * as BackupSchema from "./schema";

export const readBackupFile = Effect.fn("GraphBackupFile.readBackupFile")(function* (file: File) {
  const text = yield* Effect.tryPromise(() => file.text());
  return yield* BackupSchema.decodeFile(text);
});

export const downloadBackupFile = Effect.fn("GraphBackupFile.downloadBackupFile")(function* (
  backup: BackupSchema.Bundle,
) {
  const [encoded, fileName] = yield* Effect.all([
    BackupSchema.encodeFile(backup),
    getDownloadFileName(backup),
  ]);

  yield* Effect.sync(() => {
    const blob = new Blob([encoded], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(url);
  });
});

const getDownloadFileName = Effect.fn("GraphBackupFile.getDownloadFileName")(function* (
  backup: BackupSchema.Bundle,
) {
  const graphName = sanitizeFileName(backup.sourceGraphDisplayName);
  const exportedAt = (yield* BackupSchema.encodeBundle(backup)).exportedAt.replaceAll(":", "-"); // TODO: we encode just to get date as string
  return `${graphName}-${exportedAt}.manotes-events.json`;
});

function sanitizeFileName(input: string) {
  const sanitized = input.trim().replace(/[^a-zA-Z0-9-_]+/g, "-");
  return sanitized.length > 0 ? sanitized : "graph";
}
