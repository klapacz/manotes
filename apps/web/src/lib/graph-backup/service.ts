import { Array as Arr, DateTime, Effect, Struct } from "effect";
import * as EventRepo from "../event.repo";
import * as EventSchema from "../event.schema";
import * as GraphRuntimeLayer from "../graph-access/graph-runtime/layer";
import * as ManagedRuntime from "../graph-access/graph-runtime/managed-runtime";
import * as GraphAccessCommandsProvision from "../graph-access/commands/provision";
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
    const provision = yield* GraphAccessCommandsProvision.Service;
    const graph = yield* provision.createLocal({ displayName });

    yield* Effect.acquireUseRelease(
      ManagedRuntime.createScoped(
        GraphRuntimeLayer.makeLayer({
          localGraphId: graph.localGraphId,
          displayName: graph.displayName,
          graphSyncConfig: { mode: "local" },
        }),
      ),
      (runtime) =>
        Effect.tryPromise(() =>
          runtime.runPromise(
            EventRepo.Service.use((eventRepo) => eventRepo.importBackupEvents(backup.events)),
          ),
        ),
      (runtime) => runtime.dispose,
    );

    return graph;
  },
);
