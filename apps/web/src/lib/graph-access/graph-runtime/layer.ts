import { Effect, Layer, References, Context } from "effect";
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
import * as SessionService from "../session/service";
import * as SyncSessionWatcher from "./sync-session-watcher";
import * as DBResolution from "./db-resolution";
import * as Lock from "./lock";
import * as Observability from "../../observability";

export type SetupOpts = {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
  sessionService: Context.Service.Shape<typeof SessionService.Service>;
};

// TODO: use the same log level for migration and for the app
const makeMigratedDatabaseLayer = Effect.fnUntraced(function* (opts: SetupOpts) {
  const configLayer = Layer.succeed(
    DB.Config,
    DB.Config.of({
      localGraphId: opts.localGraphId,
      databasePath: DBResolution.getPath(opts.localGraphId),
    }),
  );
  const sqlLayer = Layer.provideMerge(SqlLive, configLayer);
  const dbLayer = Layer.provideMerge(DB.Service.layer, sqlLayer);
  const context = yield* Layer.build(dbLayer);

  yield* Migrator.migrate.pipe(Effect.provide(context));

  return Layer.succeedContext(
    context.pipe(
      Context.pick(DB.Config, DB.Service, SqliteClient.SqliteClient, SqlClient.SqlClient),
    ),
  );
}, Layer.unwrap);

export const makeLayer = (opts: SetupOpts) =>
  Layer.unwrap(
    Effect.gen(function* () {
      yield* Lock.acquireShared(opts.localGraphId);

      const graphSyncConfigLayer = Layer.succeed(
        GraphSyncConfig.Config,
        GraphSyncConfig.Config.of(opts.graphSyncConfig),
      );
      const sessionServiceLayer = Layer.succeed(SessionService.Service, opts.sessionService);

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
        SyncSessionWatcher.Service.layer,
        Layer.succeed(References.MinimumLogLevel, "Debug"),
      ).pipe(
        Layer.provide(graphSyncConfigLayer),
        Layer.provideMerge(makeMigratedDatabaseLayer(opts)),
        Layer.provideMerge(sessionServiceLayer),
        Layer.provideMerge(Observability.layer("manotes-web")),
      );
    }),
  );

export type AppLayer = ReturnType<typeof makeLayer>;
