import { Effect, Layer, RcMap, Context, Stream } from "effect";
import { RecordRepo } from "@manotes/shared/record.repo";
import { RuleRecord } from "@manotes/shared/rule-record.service";
import { PropDef } from "@manotes/shared/prop-def.service";

const ENTRY_IDLE_TTL = "5 seconds";

// Shares one reactive stream-list query per pane query and replays the last
// emission, so remounting a pane (navigation, refresh, duplicate panes)
// renders the cached list immediately instead of flashing empty.
export class Service extends Context.Service<Service>()("RecordStreamCache.Service", {
  make: Effect.gen(function* () {
    const recordRepo = yield* RecordRepo.Service;
    const ruleRecord = yield* RuleRecord.Service;
    const propDef = yield* PropDef.Service;
    const rules = yield* ruleRecord.reactiveList();
    const defs = (yield* propDef.reactiveDefs()).pipe(Stream.map(PropDef.asRecord), Stream.changes);

    const sharedMetadata = yield* Stream.zipLatestWith(rules, defs, (rules, defs) => ({
      rules,
      defs,
    })).pipe(Stream.changes, Stream.share({ capacity: 1, replay: 1 }));

    const entries = yield* RcMap.make({
      idleTimeToLive: ENTRY_IDLE_TTL,
      lookup: (query: RecordRepo.StreamListQuery) => {
        return Effect.gen(function* () {
          const source = sharedMetadata.pipe(
            Stream.switchMap((metadata) => {
              return Stream.unwrap(recordRepo.reactiveStreamList(query, metadata));
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
    Layer.provide([RecordRepo.Service.layer, RuleRecord.Service.layer, PropDef.Service.layer]),
  );
}

export * as RecordStreamCache from "./record-stream-cache.service";
