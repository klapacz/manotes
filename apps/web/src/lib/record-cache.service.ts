import { RecordSchema } from "@manotes/shared/record.schema";
import { Cache, Context, Effect, Layer, Option, RcMap, Stream } from "effect";
import * as RecordRepo from "@manotes/shared/record.repo";

export type RecordPreview = RecordRepo.Preview;

const ENTRY_IDLE_TTL = "5 seconds";

const SEED_CACHE_CAPACITY = 10_000;

export class Service extends Context.Service<Service>()("RecordCache.Service", {
  make: Effect.gen(function* () {
    const recordRepo = yield* RecordRepo.Service;

    // Primed seeds give a fresh entry an instant first value (e.g. backlink
    // labels at editor boot); the reactive query takes over right after.
    // Consumed at most once per id; expiry mirrors the entry TTL so a seed
    // skipped because its entry was already live can't resurface stale.
    const seeds = yield* Cache.make<RecordSchema.Id, RecordPreview>({
      capacity: SEED_CACHE_CAPACITY,
      timeToLive: ENTRY_IDLE_TTL,
      lookup: (id) => Effect.die(`Missing record preview seed: ${id}`),
    });

    const takeSeed = Effect.fn("RecordCache.takeSeed")(function* (id: RecordSchema.Id) {
      const seed = yield* Cache.getOption(seeds, id);
      yield* Cache.invalidate(seeds, id);

      return seed;
    });

    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (id: RecordSchema.Id) => {
        return Effect.gen(function* () {
          const source = yield* recordRepo.reactiveFindPreviewById({ id });
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
        });
      },
    });

    const prime = Effect.fn("RecordCache.prime")(function* (
      previews: ReadonlyArray<RecordPreview>,
    ) {
      yield* Effect.forEach(previews, (preview) => Cache.set(seeds, preview.id, preview), {
        discard: true,
      });
    });

    const changes = Effect.fn("RecordCache.changes")(function* (id: RecordSchema.Id) {
      return yield* RcMap.get(entries, id);
    });

    return {
      changes,
      prime,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RecordRepo.Service.layer),
  );
}
