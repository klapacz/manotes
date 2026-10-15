import { Effect, Layer, RcMap, Context, Stream } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";

const ENTRY_IDLE_TTL = "5 seconds";

// Shares one reactive stream-list query per pane query and replays the last
// emission, so remounting a pane (navigation, refresh, duplicate panes)
// renders the cached list immediately instead of flashing empty.
export class Service extends Context.Service<Service>()("RecordStreamCache.Service", {
  make: Effect.gen(function* () {
    const recordRepo = yield* RecordRepo.Service;

    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (query: RecordRepo.StreamListQuery) => {
        return Effect.gen(function* () {
          const source = yield* recordRepo.reactiveStreamList(query);

          return yield* source.pipe(
            Stream.share({
              capacity: 1,
              replay: 1,
              idleTimeToLive: ENTRY_IDLE_TTL,
            }),
          );
        });
      },
    });

    const changes = Effect.fn("RecordStreamCache.changes")(function* (
      query: RecordRepo.StreamListQuery,
    ) {
      return yield* RcMap.get(entries, cacheKey(query));
    });

    return {
      changes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(RecordRepo.Service.layer),
  );
}

// Copy the query before using it as an RcMap key. Effect structurally hashes
// object keys, so keys must not be mutated after insertion.
function cacheKey(query: RecordRepo.StreamListQuery): RecordRepo.StreamListQuery {
  return {
    type: query.type,
    date: query.date,
    backlinksTo: query.backlinksTo,
    linksFrom: query.linksFrom,
    search: query.search,
    sort: query.sort,
    props: query.props && { ...query.props },
  };
}

export * as RecordStreamCache from "./record-stream-cache.service";
