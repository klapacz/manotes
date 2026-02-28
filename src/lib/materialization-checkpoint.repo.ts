import { DateTime, Effect, Option } from "effect";
import { eq } from "drizzle-orm";
import * as DB from "./db.service";
import * as Tables from "./db.tables";

const CHECKPOINT_ROW_ID = 1;

export class Service extends Effect.Service<Service>()(
  "MaterializationCheckpointRepo.Service",
  {
    dependencies: [DB.Service.Default],
    effect: Effect.gen(function* () {
      const db = yield* DB.Service;

      const nowISOString = DateTime.now.pipe(Effect.map(DateTime.formatIso));

      const getOrInit = Effect.fn("MaterializationCheckpointRepo.getOrInit")(
        function* () {
          const existing = yield* db.find((db) =>
            db
              .select()
              .from(Tables.materializationCheckpoint)
              .where(
                eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID),
              ),
          );

          if (Option.isSome(existing)) {
            return existing.value;
          }

          const updatedAt = yield* nowISOString;

          const inserted = yield* db.find((db) =>
            db
              .insert(Tables.materializationCheckpoint)
              .values({
                id: CHECKPOINT_ROW_ID,
                lastAppliedEventId: 0,
                updatedAt,
              })
              .returning(),
          );

          return yield* Option.match(inserted, {
            onNone: () =>
              Effect.dieMessage(
                "Failed to initialize materialization checkpoint row.",
              ),
            onSome: (row) => Effect.succeed(row),
          });
        },
      );

      const getLastAppliedEventId = Effect.fn(
        "MaterializationCheckpointRepo.getLastAppliedEventId",
      )(function* () {
        const checkpoint = yield* getOrInit();
        return checkpoint.lastAppliedEventId;
      });

      const setLastAppliedEventId = Effect.fn(
        "MaterializationCheckpointRepo.setLastAppliedEventId",
      )(function* (lastAppliedEventId: number) {
        yield* getOrInit();

        const updatedAt = yield* nowISOString;

        yield* db.query((db) =>
          db
            .update(Tables.materializationCheckpoint)
            .set({
              lastAppliedEventId,
              updatedAt,
            })
            .where(eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
        );
      });

      return {
        getLastAppliedEventId,
        setLastAppliedEventId,
      };
    }),
  },
) {}
