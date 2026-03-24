import { Cause, Exit, Layer, Logger, LogLevel, ManagedRuntime } from "effect";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as GraphWorkerClient from "./graph-worker.client";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as MaterializedEventService from "./materialized-event.service";
import * as BacklinkService from "./materializer/backlink/service";
import * as Migrator from "./migrator";
import * as NoteRepo from "./note.repo";
import * as NoteCache from "./note-cache.service";
import * as EditorNoteBootCache from "./editor/note-boot-cache.service";
import * as EditorSyncService from "./editor-sync.service";
import { SqlLive } from "./db.service";

type SetupOpts = {
  localGraphId: string;
  displayName: string;
};

const runtimes = new Map<string, Type>();

export async function setup(opts: SetupOpts): Promise<Type> {
  // Use existing runtime if available
  const existingRuntime = runtimes.get(opts.localGraphId);
  if (existingRuntime) {
    return existingRuntime;
  }

  const runtime = await create(opts);
  const exit = await runtime.runPromiseExit(Migrator.migrate);

  if (Exit.isSuccess(exit)) {
    runtimes.set(opts.localGraphId, runtime);
    return runtime;
  }

  throw Cause.pretty(exit.cause);
}

export type Type = Awaited<ReturnType<typeof create>>;

async function create(opts: SetupOpts) {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      displayName: opts.displayName,
      databasePath: `${opts.localGraphId}.sqlite3`,
    }),
  );
  const DBWithConfigLayer = Layer.provideMerge(SqlLive, ConfigLayer);

  const AppLayer = Layer.mergeAll(
    EventRepo.Service.Default,
    NoteRepo.Service.Default,
    BacklinkService.Service.Default,
    NoteCache.Service.Default,
    EditorNoteBootCache.Service.Default,
    MaterializationCheckpointRepo.Service.Default,
    MaterializedEventService.Service.Default,
    EditorSyncService.Service.Default,
    GraphWorkerClient.Service.Default,
    DB.Service.Default,
    Logger.minimumLogLevel(LogLevel.Debug),
  ).pipe(Layer.provideMerge(DBWithConfigLayer));

  return ManagedRuntime.make(AppLayer);
}
