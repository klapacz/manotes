import { Effect, Layer, Context, DateTime } from "effect";
import * as EventRepo from "./event.repo";
import * as EventSchema from "./event.schema";
import * as MaterializationCheckpointRepo from "./materialization-checkpoint.repo";
import * as NoteRepo from "./note.repo";
import * as DB from "./db.service";

type CreateInput = {
  noteId: string;
  date?: string;
  createdAt: DateTime.Utc;
  payload: Uint8Array<ArrayBufferLike>;
};

type SetDateInput = {
  noteId: string;
  date: string;
  createdAt: DateTime.Utc;
};

export class Service extends Context.Service<Service>()("MaterializedEventService.Service", {
  make: Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const checkpointRepo = yield* MaterializationCheckpointRepo.Service;
    const noteRepo = yield* NoteRepo.Service;
    const db = yield* DB.Service;

    const create = Effect.fn("MaterializedEventService.create")(function* (input: CreateInput) {
      const event = yield* db.transaction(
        Effect.gen(function* () {
          const event = yield* eventRepo.create({
            noteId: input.noteId,
            payload: input.payload,
            createdAt: input.createdAt,
            type: "update",
          });

          if (!input.date) return event;

          // TODO: we could skip creating date event if update alone would result in requested date
          const setDateEvent = yield* eventRepo.create({
            noteId: input.noteId,
            payload: yield* EventSchema.encodeDatePayload({ date: input.date }),
            createdAt: input.createdAt,
            type: "date",
          });

          return setDateEvent;
        }),
      );

      yield* checkpointRepo.waitUntilAtLeast(event.localSeq);

      return yield* noteRepo.getById(event.noteId);
    });

    const setDate = Effect.fn("MaterializedEventService.setDate")(function* (input: SetDateInput) {
      const payload = yield* EventSchema.encodeDatePayload({ date: input.date });

      const event = yield* eventRepo.create({
        noteId: input.noteId,
        payload,
        createdAt: input.createdAt,
        type: "date",
      });

      yield* checkpointRepo.waitUntilAtLeast(event.localSeq);

      return yield* noteRepo.getById(event.noteId);
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
    Layer.provide(NoteRepo.Service.layer),
  );
}
