import { Layer, ManagedRuntime } from "effect";
import { DB, EventRepo, Migrator, NoteRepo } from ".";

const AppLayer = Layer.mergeAll(
  EventRepo.Service.Default,
  NoteRepo.Service.Default,
  DB.Service.Default,
);

export const runtime = ManagedRuntime.make(AppLayer);

export const setup = Migrator.migrate;
