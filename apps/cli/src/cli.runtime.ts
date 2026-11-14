import { Layer } from "effect";
import { EventRepo } from "@manotes/shared/event.repo";
import { RecordRepo } from "@manotes/shared/record.repo";
import { Materializer } from "@manotes/shared/materializer.service";
import { CliDB } from "./cli.db";
import { PropDef } from "@manotes/shared/prop-def.service";
import { RuleRecord } from "@manotes/shared/rule-record.service";
import { Attrs } from "@manotes/shared/attrs.service";

export const layer = Layer.mergeAll(
  EventRepo.Service.layer,
  RecordRepo.Service.layer,
  Materializer.Service.layer,
  PropDef.Service.layer,
  RuleRecord.Service.layer,
  Attrs.Service.layer,
).pipe(Layer.provideMerge(CliDB.layer));

export * as CliRuntime from "./cli.runtime.ts";
