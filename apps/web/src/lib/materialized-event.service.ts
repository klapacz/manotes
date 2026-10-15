import { RecordSchema } from "@manotes/shared/record.schema";
import { Effect, Layer, Context, DateTime } from "effect";
import * as EventRepo from "@manotes/shared/event.repo";
import * as EventSchema from "@manotes/shared/event.schema";
import * as MaterializationCheckpointRepo from "@manotes/shared/materialization-checkpoint.repo";
import * as RecordRepo from "@manotes/shared/record.repo";
import * as DB from "@manotes/shared/db.service";

type CreateInput = {
  recordId: RecordSchema.Id;
  date?: string;
  createdAt: DateTime.Utc;
  payload: Uint8Array<ArrayBufferLike>;
};

type SetDateInput = {
  recordId: RecordSchema.Id;
  date: string;
  createdAt: DateTime.Utc;
};

export class Service extends Context.Service<Service>()("MaterializedEventService.Service", {
  make: Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const checkpointRepo = yield* MaterializationCheckpointRepo.Service;
    const recordRepo = yield* RecordRepo.Service;
    const db = yield* DB.Service;

    const create = Effect.fn("MaterializedEventService.create")(function* (input: CreateInput) {
      const event = yield* db.transaction(
        Effect.gen(function* () {
          const event = yield* eventRepo.create({
            recordId: input.recordId,
            payload: input.payload,
            createdAt: input.createdAt,
            type: "update",
          });

          if (!input.date) return event;

          // TODO: we could skip creating date event if update alone would result in requested date
          const setDateEvent = yield* eventRepo.create({
            recordId: input.recordId,
            payload: yield* EventSchema.encodeDatePayload({ date: input.date }),
            createdAt: input.createdAt,
            type: "date",
          });

          return setDateEvent;
        }),
      );

      yield* checkpointRepo.waitUntilAtLeast(event.localSeq);

      return yield* recordRepo.getById(event.recordId);
    });

    const setDate = Effect.fn("MaterializedEventService.setDate")(function* (input: SetDateInput) {
      const payload = yield* EventSchema.encodeDatePayload({ date: input.date });

      const event = yield* eventRepo.create({
        recordId: input.recordId,
        payload,
        createdAt: input.createdAt,
        type: "date",
      });

      yield* checkpointRepo.waitUntilAtLeast(event.localSeq);

      return yield* recordRepo.getById(event.recordId);
    });

    return {
      create,
      setDate,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(DB.Service.layer),
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(MaterializationCheckpointRepo.Service.layer),
    Layer.provide(RecordRepo.Service.layer),
  );
}
