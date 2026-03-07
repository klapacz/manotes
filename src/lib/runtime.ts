import {
  Cause,
  Data,
  Exit,
  Layer,
  Logger,
  LogLevel,
  ManagedRuntime,
  Option,
} from "effect";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as GraphWorkerClient from "./graph-worker.client";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as MaterializedEventService from "./materialized-event.service";
import * as Migrator from "./migrator";
import * as NoteRepo from "./note.repo";
import * as EditorSyncService from "./editor-sync.service";

export type SetupResult = Data.TaggedEnum<{
  Success: { runtime: Type };
  DatabaseNotFound: { error: DB.NotFoundError };
}>;
export const setupResult = Data.taggedEnum<SetupResult>();

type SetupOpts = {
  graphName: string;
  allowCreate: boolean;
};

const runtimes = new Map<string, Type>();

export async function setup(opts: SetupOpts): Promise<SetupResult> {
  // Use existing runtime if available
  const existingRuntime = runtimes.get(opts.graphName);
  if (existingRuntime) {
    return setupResult.Success({ runtime: existingRuntime });
  }

  const runtime = await create(opts);
  const exit = await runtime.runPromiseExit(Migrator.migrate);

  if (Exit.isSuccess(exit)) {
    runtimes.set(opts.graphName, runtime);
    return setupResult.Success({ runtime });
  }

  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure) && failure.value._tag === "DB.NotFoundError") {
    return setupResult.DatabaseNotFound({ error: failure.value });
  }

  throw Cause.pretty(exit.cause);
}

export type Type = Awaited<ReturnType<typeof create>>;

async function create(opts: SetupOpts) {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      graphName: opts.graphName,
      allowCreate: opts.allowCreate,
      databasePath: `${opts.graphName}.sqlite3`,
    }),
  );

  const AppLayer = Layer.mergeAll(
    EventRepo.Service.Default,
    NoteRepo.Service.Default,
    MaterializationCheckpointRepo.Service.Default,
    MaterializedEventService.Service.Default,
    EditorSyncService.Service.Default,
    GraphWorkerClient.Service.Default,
    DB.Service.Default,
    Logger.minimumLogLevel(LogLevel.Debug),
  ).pipe(Layer.provide(ConfigLayer));

  return ManagedRuntime.make(AppLayer);
}
