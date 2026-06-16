import { Effect, Layer, RcMap, Context, Stream } from "effect";
import * as NoteRepo from "./note.repo";

const ENTRY_IDLE_TTL = "5 seconds";

// Shares one reactive stream-list query per pane query and replays the last
// emission, so remounting a pane (navigation, refresh, duplicate panes)
// renders the cached list immediately instead of flashing empty.
export class Service extends Context.Service<Service>()("NoteStreamCache.Service", {
  make: Effect.gen(function* () {
    const noteRepo = yield* NoteRepo.Service;
    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (query: NoteRepo.StreamListQuery) =>
        Effect.gen(function* () {
          const source = yield* noteRepo.reactiveStreamList(query);

          return yield* source.pipe(
            Stream.share({
              capacity: 1,
              replay: 1,
              idleTimeToLive: ENTRY_IDLE_TTL,
            }),
          );
        }),
    });

    const changes = Effect.fn("NoteStreamCache.changes")(function* (
      query: NoteRepo.StreamListQuery,
    ) {
      return yield* RcMap.get(entries, cacheKey(query));
    });

    return {
      changes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(NoteRepo.Service.layer));
}

// Copy the query before using it as an RcMap key. Effect structurally hashes
// object keys, so keys must not be mutated after insertion.
function cacheKey(query: NoteRepo.StreamListQuery): NoteRepo.StreamListQuery {
  return {
    type: query.type,
    date: query.date,
    backlinksTo: query.backlinksTo,
    relatedTo: query.relatedTo,
    sort: query.sort,
  };
}
