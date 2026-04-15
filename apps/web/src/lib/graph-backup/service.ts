import { Array as Arr, DateTime, Effect, Struct } from "effect";
import * as EventRepo from "../event.repo";
import * as EventSchema from "../event.schema";
import * as LocalRegistry from "../graph-access/local-registry";
import * as Runtime from "../runtime";
import * as BackupSchema from "./schema";

export function createBackup({
  sourceGraphDisplayName,
  exportedAt,
  events,
}: {
  sourceGraphDisplayName: string;
  exportedAt: BackupSchema.Bundle["exportedAt"];
  events: ReadonlyArray<EventSchema.Record>;
}): BackupSchema.Bundle {
  return {
    version: 1,
    exportedAt,
    sourceGraphDisplayName,
    events: Arr.map(events, Struct.omit(["localSeq", "commitSeq"])),
  };
}

export function getSuggestedGraphName({
  backup,
  fileName,
}: {
  backup: BackupSchema.Bundle;
  fileName: string;
}) {
  const backupName = backup.sourceGraphDisplayName.trim();

  if (backupName.length > 0) return backupName;

  const stem = fileName.replace(/\.[^.]+$/, "").trim();
  return stem.length > 0 ? stem : "Imported graph";
}

export const exportBackup = Effect.fn("GraphBackupService.exportBackup")(function* ({
  sourceGraphDisplayName,
}: {
  sourceGraphDisplayName: string;
}) {
  const eventRepo = yield* EventRepo.Service;
  const exportedAt = yield* DateTime.now;
  const events = yield* eventRepo.listAllForBackup();

  return createBackup({
    sourceGraphDisplayName,
    exportedAt,
    events,
  });
});

export const importBackupToNewGraph = Effect.fn("GraphBackupService.importBackupToNewGraph")(
  function* ({ backup, displayName }: { backup: BackupSchema.Bundle; displayName: string }) {
    const graph = yield* LocalRegistry.Repo.createGraph(displayName);
    const runtime = yield* Effect.tryPromise(() =>
      Runtime.setup({
        localGraphId: graph.localGraphId,
        displayName: graph.displayName,
        graphSyncConfig: { mode: "local" },
      }),
    );

    yield* Effect.tryPromise(() =>
      runtime.rt.runPromise(
        Effect.gen(function* () {
          const eventRepo = yield* EventRepo.Service;
          yield* eventRepo.importBackupEvents(backup.events);
        }),
      ),
    );

    return graph;
  },
);
