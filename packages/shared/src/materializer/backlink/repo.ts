import { Effect, Layer, Context } from "effect";
import { eq } from "drizzle-orm";
import * as DB from "../../db.service";
import * as Tables from "../../db.tables";

export class Service extends Context.Service<Service>()("Materializer.BacklinkRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const replaceForSource = Effect.fn("Materializer.BacklinkRepo.replaceForSource")(function* (
      sourceId: string,
      targetIds: ReadonlyArray<string>,
    ) {
      yield* db.query((db) =>
        db
          .delete(Tables.backlinks)
          .where(eq(Tables.backlinks.sourceId, sourceId))
          .returning({ sourceId: Tables.backlinks.sourceId }),
      );

      if (targetIds.length === 0) return;

      yield* db.query((db) =>
        db
          .insert(Tables.backlinks)
          .values(
            targetIds.map((targetId) => ({
              sourceId,
              targetId,
            })),
          )
          .returning({ sourceId: Tables.backlinks.sourceId }),
      );
    });

    return {
      replaceForSource,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}
