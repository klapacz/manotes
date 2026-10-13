import { Query } from "effect-qb";
import { Array, Effect, Layer, Context } from "effect";
import * as DB from "../../db.service";
import * as Tables from "../../db.tables";

export class Service extends Context.Service<Service>()("Materializer.BacklinkRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const replaceForSource = Effect.fn("Materializer.BacklinkRepo.replaceForSource")(function* (
      sourceId: string,
      targetIds: ReadonlyArray<string>,
    ) {
      yield* db.query(
        Query.delete(Tables.backlinks).pipe(
          Query.where(Query.eq(Tables.backlinks.sourceId, sourceId)),
          Query.returning({ sourceId: Tables.backlinks.sourceId }),
        ),
      );

      const [first, ...rest] = targetIds;

      if (first === undefined) return;

      yield* db.query(
        Query.insert(Tables.backlinks).pipe(
          Query.from(
            Query.values(
              Array.map([first, ...rest] as const, (targetId) => ({ sourceId, targetId })),
            ),
          ),
          Query.returning({ sourceId: Tables.backlinks.sourceId }),
        ),
      );
    });

    return {
      replaceForSource,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}
