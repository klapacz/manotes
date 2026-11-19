import { Effect, Layer, RcMap, Context, Stream } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";
import { RuleRecord } from "@manotes/shared/rule-record.service";

const ENTRY_IDLE_TTL = "5 seconds";

// Shares one reactive stream-list query per pane query and replays the last
// emission, so remounting a pane (navigation, refresh, duplicate panes)
// renders the cached list immediately instead of flashing empty.
export class Service extends Context.Service<Service>()("RecordStreamCache.Service", {
  make: Effect.gen(function* () {
    const recordRepo = yield* RecordRepo.Service;
    const ruleRecord = yield* RuleRecord.Service;
    const rules = yield* ruleRecord.reactiveList();
    const sharedRules = yield* rules.pipe(Stream.changes, Stream.share({ capacity: 1, replay: 1 }));

    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (query: RecordRepo.StreamListQuery) => {
        return Effect.gen(function* () {
          const source = sharedRules.pipe(
            Stream.switchMap((rules) => {
              return Stream.unwrap(recordRepo.reactiveStreamList(query, rules));
            }),
          );

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
      return yield* RcMap.get(entries, structuredClone(query));
    });

    return {
      changes,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([RecordRepo.Service.layer, RuleRecord.Service.layer]),
  );
}

export * as RecordStreamCache from "./record-stream-cache.service";
