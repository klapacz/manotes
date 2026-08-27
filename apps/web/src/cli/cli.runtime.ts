import { Layer } from "effect";
import * as EventRepo from "../lib/event.repo";
import * as NoteRepo from "../lib/note.repo";
import * as Materializer from "../lib/materializer.service";
import { CliDB } from "./cli.db";

export const layer = Layer.mergeAll(
  EventRepo.Service.layer,
  NoteRepo.Service.layer,
  Materializer.Service.layer,
).pipe(Layer.provideMerge(CliDB.layer));

export * as CliRuntime from "./cli.runtime.ts";
