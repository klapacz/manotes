import { Effect, Layer, References } from "effect";
import * as EditorSyncService from "../../editor-sync.service";
import * as EventRepo from "@manotes/shared/event.repo";
import * as GraphSyncConfig from "@manotes/shared/graph-sync/config";
import * as GraphWorkerClient from "../../graph-worker.client";
import * as MaterializationCheckpointRepo from "@manotes/shared/materialization-checkpoint.repo";
import * as MaterializedEventService from "../../materialized-event.service";
import * as BacklinkService from "@manotes/shared/materializer/backlink/service";
import * as NoteCache from "../../note-cache.service";
import * as NoteStreamCache from "../../note-stream-cache.service";
import * as NoteRepo from "@manotes/shared/note.repo";
import * as BrowserExtensionTabNoteService from "../../browser-extension/tab-note/service";
import * as SessionService from "../session/service";
import * as SyncSessionWatcher from "./sync-session-watcher";
import * as Lock from "./lock";
import { GraphDatabase } from "./database";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";

export type SetupOpts = {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
  sessionService: Effect.Success<typeof SessionService.Service>;
};

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
        Attrs.Service.layer,
        PropRecordRepo.Service.layer,
        BacklinkService.Service.layer,
        NoteCache.Service.layer,
        NoteStreamCache.Service.layer,
        MaterializationCheckpointRepo.Service.layer,
        MaterializedEventService.Service.layer,
        BrowserExtensionTabNoteService.Service.layer,
        EditorSyncService.Service.layer,
        GraphWorkerClient.Service.layer,
        SyncSessionWatcher.Service.layer,
        Layer.succeed(References.MinimumLogLevel, "Debug"),
      ).pipe(
        Layer.provide(graphSyncConfigLayer),
        Layer.provideMerge(GraphDatabase.layer(opts)),
        Layer.provideMerge(sessionServiceLayer),
      );
    }),
  );

export type AppLayer = ReturnType<typeof makeLayer>;
