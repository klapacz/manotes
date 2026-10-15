import { Array as Arr, DateTime, Effect, Struct } from "effect";
import { EventRepo } from "@manotes/shared/event.repo";
import { GraphAccessCommandsProvision } from "../graph-access/commands/provision";
import { GraphBackupSchema as BackupSchema } from "@manotes/shared/graph-backup/schema";

export function createBackup({
  sourceGraphDisplayName,
  exportedAt,
  events,
}: {
  sourceGraphDisplayName: string;
  exportedAt: BackupSchema.Bundle["exportedAt"];
  events: ReadonlyArray<EventRepo.Record>;
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

    return yield* provision.createLocal({ displayName, events: backup.events });
  },
);

export * as GraphBackupService from "./service";
