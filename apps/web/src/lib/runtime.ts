import { Cause, Exit, Layer, ManagedRuntime, References } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as DB from "./db.service";
import * as EventRepo from "./event.repo";
import * as GraphWorkerClient from "./graph-worker.client";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as MaterializedEventService from "./materialized-event.service";
import * as BrowserExtensionTabNoteService from "./browser-extension/tab-note/service";
import * as BacklinkService from "./materializer/backlink/service";
import * as Migrator from "./migrator";
import * as NoteRepo from "./note.repo";
import * as NoteCache from "./note-cache.service";
import * as EditorNoteBootCache from "./editor/note-boot-cache.service";
import * as EditorSyncService from "./editor-sync.service";
import { SqlLive } from "./db.service";
import * as GraphSyncConfig from "./graph-sync/config";

export type SetupOpts = {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
};

const runtimes = new Map<string, Type>();

const makeLayer = (opts: SetupOpts) => {
  const ConfigLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      displayName: opts.displayName,
      databasePath: `${opts.localGraphId}.sqlite3`,
    }),
  );
  const DBWithConfigLayer = Layer.provideMerge(SqlLive, ConfigLayer);

  const GraphSyncConfigLayer = Layer.succeed(
    GraphSyncConfig.Config,
    GraphSyncConfig.Config.of(opts.graphSyncConfig),
  );

  return Layer.mergeAll(
    EventRepo.Service.layer,
    NoteRepo.Service.layer,
    BacklinkService.Service.layer,
    NoteCache.Service.layer,
    EditorNoteBootCache.Service.layer,
    MaterializationCheckpointRepo.Service.layer,
    MaterializedEventService.Service.layer,
    BrowserExtensionTabNoteService.Service.layer,
    EditorSyncService.Service.layer,
    GraphWorkerClient.Service.layer,
    DB.Service.layer,
    Layer.succeed(References.MinimumLogLevel, "Debug"),
  ).pipe(Layer.provide(GraphSyncConfigLayer), Layer.provideMerge(DBWithConfigLayer));
};

type AppLayer = ReturnType<typeof makeLayer>;

export interface Type {
  rt: ManagedRuntime.ManagedRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
  atom: Atom.AtomRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
}

export async function setup(opts: SetupOpts): Promise<Type> {
  // Use existing runtime if available
  // TODO: This cache key assumes a graph's runtime config never changes.
  // Promoting a local graph to cloud mode reuses the stale local-only runtime.
  const existingRuntime = runtimes.get(opts.localGraphId);
  if (existingRuntime) {
    return existingRuntime;
  }

  const runtime = await create(opts);
  const exit = await runtime.rt.runPromiseExit(Migrator.migrate);

  if (Exit.isSuccess(exit)) {
    runtimes.set(opts.localGraphId, runtime);
    return runtime;
  }

  throw Cause.pretty(exit.cause);
}

export function get(localGraphId: string): Type | null {
  const runtime = runtimes.get(localGraphId);
  return runtime ?? null;
}

async function create(opts: SetupOpts) {
  const AppLayer = makeLayer(opts);
  const memoMap = Layer.makeMemoMapUnsafe();

  return {
    rt: ManagedRuntime.make(AppLayer, { memoMap }),
    atom: Atom.context({ memoMap })(AppLayer),
  };
}
