import { Layer } from "effect";
import { EventRepo } from "@manotes/shared/event.repo";
import { RecordRepo } from "@manotes/shared/record.repo";
import { Materializer } from "@manotes/shared/materializer.service";
import { CliDB } from "./cli.db";

export const layer = Layer.mergeAll(
  EventRepo.Service.layer,
  RecordRepo.Service.layer,
  Materializer.Service.layer,
).pipe(Layer.provideMerge(CliDB.layer));

export * as CliRuntime from "./cli.runtime.ts";
