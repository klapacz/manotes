import { Effect, Layer, ManagedRuntime, References, ServiceMap } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@manotes/sql-sqlite-wasm/sqlite-client";
import * as DB from "../../db.service";
import { SqlLive } from "../../db.service";
import * as EditorNoteBootCache from "../../editor/note-boot-cache.service";
import * as EditorSyncService from "../../editor-sync.service";
import * as EventRepo from "../../event.repo";
import * as GraphSyncConfig from "../../graph-sync/config";
import * as GraphWorkerClient from "../../graph-worker.client";
import * as MaterializationCheckpointRepo from "../../materialization-checkpoint.repo";
import * as MaterializedEventService from "../../materialized-event.service";
import * as BacklinkService from "../../materializer/backlink/service";
import * as Migrator from "../../migrator";
import * as NoteCache from "../../note-cache.service";
import * as NoteRepo from "../../note.repo";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";

export type SetupOpts = {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
};

const runtimes = new Map<string, Type>();

// TODO: use the same log level for migration and for the app
const makeMigratedDatabaseLayer = Effect.fnUntraced(function* (opts: SetupOpts) {
  const configLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      displayName: opts.displayName,
      databasePath: `${opts.localGraphId}.sqlite3`,
    }),
  );
  const sqlLayer = Layer.provideMerge(SqlLive, configLayer);
  const dbLayer = Layer.provideMerge(DB.Service.layer, sqlLayer);
  const context = yield* Layer.build(dbLayer);

  yield* Migrator.migrate.pipe(Effect.provide(context));

  return Layer.succeedServices(
    context.pipe(
      ServiceMap.pick(DB.Config, DB.Service, SqliteClient.SqliteClient, SqlClient.SqlClient),
    ),
  );
}, Layer.unwrap);

export const makeLayer = (opts: SetupOpts) => {
  const graphSyncConfigLayer = Layer.succeed(
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
    Layer.succeed(References.MinimumLogLevel, "Debug"),
  ).pipe(Layer.provide(graphSyncConfigLayer), Layer.provideMerge(makeMigratedDatabaseLayer(opts)));
};

export type AppLayer = ReturnType<typeof makeLayer>;

export interface Type {
  rt: ManagedRuntime.ManagedRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
  atom: Atom.AtomRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>>;
}

export function setup(opts: SetupOpts): Type {
  const existingRuntime = runtimes.get(opts.localGraphId);
  if (existingRuntime) {
    return existingRuntime;
  }

  const runtime = create(opts);
  runtimes.set(opts.localGraphId, runtime);
  return runtime;
}

export function get(localGraphId: string): Type | null {
  const runtime = runtimes.get(localGraphId);
  return runtime ?? null;
}

export function create(opts: SetupOpts): Type {
  const appLayer = makeLayer(opts);
  const memoMap = Layer.makeMemoMapUnsafe();

  return {
    rt: ManagedRuntime.make(appLayer, { memoMap }),
    atom: Atom.context({ memoMap })(appLayer),
  };
}
