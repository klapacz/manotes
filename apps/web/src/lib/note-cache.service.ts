import { Cache, Context, Effect, Layer, Option, RcMap, Stream } from "effect";
import * as NoteRepo from "./note.repo";
import * as NoteSchema from "./note.schema";

export type NotePreview = typeof NoteSchema.Preview.Type;

const ENTRY_IDLE_TTL = "5 seconds";

const SEED_CACHE_CAPACITY = 10_000;

export class Service extends Context.Service<Service>()("NoteCache.Service", {
  make: Effect.gen(function* () {
    const noteRepo = yield* NoteRepo.Service;

    // Primed seeds give a fresh entry an instant first value (e.g. backlink
    // labels at editor boot); the reactive query takes over right after.
    // Consumed at most once per id; expiry mirrors the entry TTL so a seed
    // skipped because its entry was already live can't resurface stale.
    const seeds = yield* Cache.make<string, NotePreview>({
      capacity: SEED_CACHE_CAPACITY,
      timeToLive: ENTRY_IDLE_TTL,
      lookup: (id) => Effect.die(`Missing note preview seed: ${id}`),
    });

    const takeSeed = Effect.fn("NoteCache.takeSeed")(function* (id: string) {
      const seed = yield* Cache.getOption(seeds, id);
      yield* Cache.invalidate(seeds, id);

      return seed;
    });

    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (id: string) =>
        Effect.gen(function* () {
          const source = yield* noteRepo.reactiveFindPreviewById(id);
          const seed = yield* takeSeed(id);

          const seeded = Option.match(seed, {
            onNone: () => source,
            onSome: (preview) => Stream.concat(Stream.succeed(Option.some(preview)), source),
          });

          return yield* seeded.pipe(
            Stream.share({
              capacity: 1,
              replay: 1,
              idleTimeToLive: ENTRY_IDLE_TTL,
            }),
          );
        }),
    });

    const prime = Effect.fn("NoteCache.prime")(function* (previews: ReadonlyArray<NotePreview>) {
      yield* Effect.forEach(previews, (preview) => Cache.set(seeds, preview.id, preview), {
        discard: true,
      });
    });

    const changes = Effect.fn("NoteCache.changes")(function* (id: string) {
      return yield* RcMap.get(entries, id);
    });

    return {
      changes,
      prime,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(NoteRepo.Service.layer));
}
