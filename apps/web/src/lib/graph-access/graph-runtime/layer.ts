import { Effect, Layer, References } from "effect";
import { LiveDoc } from "../../live-doc.service";
import * as EventRepo from "@manotes/shared/event.repo";
import * as GraphSyncConfig from "@manotes/shared/graph-sync/config";
import * as GraphWorkerClient from "../../graph-worker.client";
import * as MaterializationCheckpointRepo from "@manotes/shared/materialization-checkpoint.repo";
import * as MaterializedEventService from "../../materialized-event.service";
import * as BacklinkService from "@manotes/shared/materializer/backlink/service";
import * as RecordCache from "../../record-cache.service";
import * as RecordStreamCache from "../../record-stream-cache.service";
import * as RecordRepo from "@manotes/shared/record.repo";
import * as BrowserExtensionTabRecordService from "../../browser-extension/tab-record/service";
import * as SessionService from "../session/service";
import * as SyncSessionWatcher from "./sync-session-watcher";
import * as Lock from "./lock";
import { GraphDatabase } from "./database";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropDef } from "@manotes/shared/prop-def.service";
import { EnumOptionRepo } from "@manotes/shared/enum-option.repo";
import { RuleRecord } from "@manotes/shared/rule-record.service";

export type SetupOpts = {
  localGraphId: string;
  displayName: string;
  graphSyncConfig: GraphSyncConfig.GraphSyncConfig;
  sessionService: Effect.Success<typeof SessionService.Service>;
};

export const makeLayer = (opts: SetupOpts) => {
  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Lock.acquireShared(opts.localGraphId);

      const graphSyncConfigLayer = Layer.succeed(
        GraphSyncConfig.Config,
        GraphSyncConfig.Config.of(opts.graphSyncConfig),
      );

      const sessionServiceLayer = Layer.succeed(SessionService.Service, opts.sessionService);

      return Layer.mergeAll(
        EventRepo.Service.layer,
        RecordRepo.Service.layer,
        Attrs.Service.layer,
        PropDef.Service.layer,
        EnumOptionRepo.Service.layer,
        RuleRecord.Service.layer,
        BacklinkService.Service.layer,
        RecordCache.Service.layer,
        RecordStreamCache.Service.layer,
        MaterializationCheckpointRepo.Service.layer,
        MaterializedEventService.Service.layer,
        BrowserExtensionTabRecordService.Service.layer,
        LiveDoc.Service.layer,
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
};

export type AppLayer = ReturnType<typeof makeLayer>;
