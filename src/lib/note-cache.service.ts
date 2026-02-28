import { Effect, Option, RcMap, Stream } from "effect";
import * as NoteRepo from "./note.repo";
import * as NoteSchema from "./note.schema";

export type NotePreview = typeof NoteSchema.Preview.Type;

const ENTRY_IDLE_TTL = "5 seconds";

export class Service extends Effect.Service<Service>()("NoteCache.Service", {
  dependencies: [NoteRepo.Service.Default],
  scoped: Effect.gen(function* () {
    const noteRepo = yield* NoteRepo.Service;
    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (id: string) =>
        Effect.gen(function* () {
          const source = yield* noteRepo.reactiveFindPreviewById(id);

          return yield* source.pipe(
            Stream.share({
              capacity: 1,
              replay: 1,
              idleTimeToLive: ENTRY_IDLE_TTL,
            }),
          );
        }),
    });

    const changes = Effect.fn("NoteCache.changes")(function* (id: string) {
      return yield* RcMap.get(entries, id);
    });

    const findById = Effect.fn("NoteCache.findById")(function* (id: string) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const changes = yield* RcMap.get(entries, id);
          const current = yield* changes.pipe(Stream.runHead);

          return Option.getOrNull(current);
        }),
      );
    });

    return {
      findById,
      changes,
    };
  }),
}) {}
