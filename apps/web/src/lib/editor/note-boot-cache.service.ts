import { Effect, Layer, Option, RcMap, Context, Stream } from "effect";
import * as NoteRepo from "../note.repo";
import * as NoteSchema from "../note.schema";
import * as BacklinkService from "../materializer/backlink/service";

export type NoteBoot = Pick<
  typeof NoteSchema.Record.Type,
  "lastEventLocalSeq" | "materializedYUpdate"
>;

const ENTRY_IDLE_TTL = "5 seconds";

export class Service extends Context.Service<Service>()("EditorNoteBootCache.Service", {
  make: Effect.gen(function* () {
    const noteRepo = yield* NoteRepo.Service;
    const noteEntries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (id: string) =>
        Effect.gen(function* () {
          const source = yield* noteRepo.reactiveFindById(id);

          return yield* source.pipe(
            Stream.map(
              Option.map(
                (note): NoteBoot => ({
                  lastEventLocalSeq: note.lastEventLocalSeq,
                  materializedYUpdate: note.materializedYUpdate,
                }),
              ),
            ),
            Stream.share({
              capacity: 1,
              replay: 1,
              idleTimeToLive: ENTRY_IDLE_TTL,
            }),
          );
        }),
    });

    const changes = Effect.fn("EditorNoteBootCache.changes")(function* (id: string) {
      return yield* RcMap.get(noteEntries, id);
    });

    const findById = Effect.fn("EditorNoteBootCache.findById")(function* (id: string) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const changes = yield* RcMap.get(noteEntries, id);
          const current = yield* changes.pipe(Stream.runHead);

          return Option.getOrElse(current, () => Option.none<NoteBoot>());
        }),
      );
    });

    const preload = Effect.fn("EditorNoteBootCache.preload")(function* (id: string) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const noteChanges = yield* RcMap.get(noteEntries, id);
          yield* noteChanges.pipe(Stream.runHead);
        }),
      );
    });

    return {
      changes,
      findById,
      preload,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(NoteRepo.Service.layer),
    Layer.provide(BacklinkService.Service.layer),
  );
}
