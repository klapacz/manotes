import { Query } from "effect-qb";
import { DateTime, Effect, Layer, Option, Context, Stream, Array } from "effect";
import * as DB from "./db.service";
import * as Tables from "./db.tables";
import { EffectOption } from "./effect/effect-option";

const CHECKPOINT_ROW_ID = 1;

export class Service extends Context.Service<Service>()("MaterializationCheckpointRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const nowISOString = DateTime.now.pipe(Effect.map(DateTime.formatIso));

    const getOrInit = Effect.fn("MaterializationCheckpointRepo.getOrInit")(function* () {
      const existing = yield* db.find(
        Query.select(Tables.materializationCheckpoint.columns).pipe(
          Query.from(Tables.materializationCheckpoint),
          Query.where(Query.eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
        ),
      );

      if (Option.isSome(existing)) return existing.value;

      const updatedAt = yield* nowISOString;

      return yield* db
        .find(
          Query.insert(Tables.materializationCheckpoint, {
            id: CHECKPOINT_ROW_ID,
            lastAppliedLocalSeq: 0,
            updatedAt,
          }).pipe(Query.returning(Tables.materializationCheckpoint.columns)),
        )
        .pipe(
          EffectOption.getOrEffect(() => {
            return Effect.die(new Error("Failed to initialize materialization checkpoint row."));
          }),
        );
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

      yield* db.query(
        Query.update(Tables.materializationCheckpoint, {
          lastAppliedLocalSeq,
          updatedAt,
        }).pipe(
          Query.where(Query.eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
          Query.returning(Tables.materializationCheckpoint.columns),
        ),
      );
    });

    const waitUntilAtLeast = Effect.fn("MaterializationCheckpointRepo.waitUntilAtLeast")(function* (
      targetLocalSeq: number,
    ) {
      yield* getOrInit();

      const stream = yield* db.reactiveQuery(
        Query.select({
          lastAppliedLocalSeq: Tables.materializationCheckpoint.lastAppliedLocalSeq,
        }).pipe(
          Query.from(Tables.materializationCheckpoint),
          Query.where(Query.eq(Tables.materializationCheckpoint.id, CHECKPOINT_ROW_ID)),
        ),
      );

      return yield* stream.pipe(
        Stream.map(Array.head),
        Stream.filter(Option.isSome),
        Stream.map((row) => row.value.lastAppliedLocalSeq),
        Stream.filter((lastAppliedLocalSeq) => lastAppliedLocalSeq >= targetLocalSeq),
        Stream.runHead,
        EffectOption.getOrEffect(() => {
          return Effect.die(
            new Error("Checkpoint stream ended before target event was materialized."),
          );
        }),
        Effect.asVoid,
      );
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

export * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
