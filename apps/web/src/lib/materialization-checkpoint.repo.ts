import { DateTime, Effect, Layer, Option, Context, Stream, Array } from "effect";
import { eq } from "drizzle-orm";
import * as DB from "./db.service";
import * as Tables from "./db.tables";

const CHECKPOINT_ROW_ID = 1;

export class Service extends Context.Service<Service>()("MaterializationCheckpointRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const nowISOString = DateTime.now.pipe(Effect.map(DateTime.formatIso));

    const getOrInit = Effect.fn("MaterializationCheckpointRepo.getOrInit")(function* () {
      const existing = yield* db.find((db) =>
        db
          .select()
          .from(Tables.materializationCheckpoint)
          .where(eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
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
            lastAppliedLocalSeq: 0,
            updatedAt,
          })
          .returning(),
      );

      return yield* Option.match(inserted, {
        onNone: () => Effect.die(new Error("Failed to initialize materialization checkpoint row.")),
        onSome: (row) => Effect.succeed(row),
      });
    });

    const getLastAppliedLocalSeq = Effect.fn(
      "MaterializationCheckpointRepo.getLastAppliedLocalSeq",
    )(function* () {
      const checkpoint = yield* getOrInit();

      return checkpoint.lastAppliedLocalSeq;
    });

    const setLastAppliedLocalSeq = Effect.fn(
      "MaterializationCheckpointRepo.setLastAppliedLocalSeq",
    )(function* (lastAppliedLocalSeq: number) {
      yield* getOrInit();

      const updatedAt = yield* nowISOString;

      yield* db.query((db) =>
        db
          .update(Tables.materializationCheckpoint)
          .set({
            lastAppliedLocalSeq,
            updatedAt,
          })
          .where(eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID))
          .returning(),
      );
    });

    const waitUntilAtLeast = Effect.fn("MaterializationCheckpointRepo.waitUntilAtLeast")(function* (
      targetLocalSeq: number,
    ) {
      yield* getOrInit();

      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({
            lastAppliedLocalSeq: Tables.materializationCheckpoint.lastAppliedLocalSeq,
          })
          .from(Tables.materializationCheckpoint)
          .where(eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
      );

      const reached = yield* stream.pipe(
        Stream.map(Array.head),
        Stream.filter(Option.isSome),
        Stream.map((row) => row.value.lastAppliedLocalSeq),
        Stream.filter((lastAppliedLocalSeq) => lastAppliedLocalSeq >= targetLocalSeq),
        Stream.runHead,
      );

      return yield* Option.match(reached, {
        onNone: () =>
          Effect.die(new Error("Checkpoint stream ended before target event was materialized.")),
        onSome: () => Effect.void,
      });
    });

    return {
      getLastAppliedLocalSeq,
      setLastAppliedLocalSeq,
      waitUntilAtLeast,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}
