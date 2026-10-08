import { Layer } from "effect";
import * as EventRepo from "@manotes/shared/event.repo";
import * as NoteRepo from "@manotes/shared/note.repo";
import * as Materializer from "@manotes/shared/materializer.service";
import { CliDB } from "./cli.db";

export const layer = Layer.mergeAll(
  EventRepo.Service.layer,
  NoteRepo.Service.layer,
  Materializer.Service.layer,
).pipe(Layer.provideMerge(CliDB.layer));

export * as CliRuntime from "./cli.runtime.ts";
